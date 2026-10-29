/**
 * 浏览器直存下载。
 *
 * 和后台的下载管理器是两条完全独立的路：
 * - 后台跑在 node 进程里，直接落盘到 download.savePath，记录存 SQLite。
 * - 这里跑在页面里，用 File System Access API 写到用户自己选的本机目录，
 *   记录存 IndexedDB（见 ./db）。文件从头到尾不经过服务端磁盘。
 *
 * 音源直链带 Referer / 签名且跨域，页面 fetch 会被 CORS 挡掉，
 * 所以统一走服务端现成的 /p_url 代理把内容转一手。
 * 代价是：代理的 cookie 是登录后种的 session cookie，cookie 没了这里就 403。
 */

import { DOWNLOAD_STATUS } from '@any-listen/common/constants'
import { buildMusicCacheId, buildMusicName, detectFormatFromUrl, getFileType } from '@any-listen/common/tools'
import SingleEvent from '@any-listen/web/SimpleSingleEvent'
import { buildUrl } from '@any-listen/web'

import { i18n } from '@/plugins/i18n'
import { sizeFormate } from '@/shared'
import { getMusicUrl } from '@/shared/ipc/music'
import { appState } from '@/modules/app/store/state'
import { settingState } from '@/modules/setting/store/state'

import {
  clearBrowserTasks,
  getBrowserMeta,
  getBrowserTasks,
  removeBrowserTasks,
  saveBrowserTask,
  setBrowserMeta,
  type BrowserDownloadTask,
} from './db'

/**
 * File System Access API 用到的最小接口声明。
 * 这些类型在部分 TS 版本的 lib.dom 里还没有，自己声明一份，避免和 lib 版本绑死。
 */
export interface BrowserWritable {
  write(data: BufferSource | Blob | string): Promise<void>
  seek(position: number): Promise<void>
  truncate(size: number): Promise<void>
  close(): Promise<unknown>
}

export interface BrowserFileHandle {
  readonly name: string
  readonly kind: string
  createWritable?(options?: { keepExistingData?: boolean; truncate?: number }): Promise<BrowserWritable>
}

export interface BrowserDirectoryHandle {
  readonly name: string
  readonly kind: string
  queryPermission?(descriptors?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  requestPermission?(descriptors?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  getFileHandle?(name: string, options?: { create?: boolean }): Promise<BrowserFileHandle | null>
  removeEntry?(name: string): Promise<void>
}

interface BrowserPickerWindow extends Window {
  showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<BrowserDirectoryHandle>
}

export interface AddBrowserDownloadInfo {
  musicInfo: AnyListen.Music.MusicInfoOnline
  quality: string
}

const DIR_META_KEY = 'downloadDir'
/** 和服务端下载管理器保持一致 */
const MAX_CONCURRENT = 3
const MAX_RETRY = 1
/** 同一任务进度事件的最小间隔，避免刷屏 */
const PROGRESS_INTERVAL = 500
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g

/** 任务增删 / 重下排队，通知上层整表刷新 */
export const browserTaskListChanged = new SingleEvent<[]>()
/** 单条任务的局部改动，metadata 只带变的字段，上层自己合并 */
export type BrowserTaskPatch = Partial<Omit<BrowserDownloadTask, 'metadata'>> & {
  metadata?: Partial<BrowserDownloadTask['metadata']>
}
/** 单条任务状态变化（进度 / 完成 / 出错），上层做单条 patch 就行 */
export const browserTaskUpdated = new SingleEvent<[id: string, patch: BrowserTaskPatch]>()
/** 任务动作事件，形状和服务端 IPC 的 TaskEvent 一致，通知层可以复用同一份逻辑 */
export const browserTaskEvent = new SingleEvent<[event: AnyListen.IPCDownload.TaskEvent]>()

const tasks = new Map<string, BrowserDownloadTask>()
const waitingIds: string[] = []
const runningIds = new Set<string>()
const cancelIds = new Set<string>()
const controllers = new Map<string, AbortController>()
let inited = false

/** 浏览器直存只有 web + 新版 Chromium 可用，桌面端没有 File System Access API */
export const canBrowserDownload = () =>
  import.meta.env.VITE_IS_WEB && typeof window !== 'undefined' && 'showDirectoryPicker' in window

/**
 * 从文件头判断实际格式。魔数比 URL 后缀可靠 —— 有些扩展在响应头 / 路径上都骗人，
 * 但文件内容骗不了。返回 null 表示头不够或者格式不识别，调用方按"无法判断"处理。
 */
export const detectFormatFromBytes = (bytes: Uint8Array): AnyListen.Music.FileType | null => {
  if (bytes.length < 4) return null
  // FLAC: 'fLaC'
  if (bytes[0] == 0x66 && bytes[1] == 0x4c && bytes[2] == 0x61 && bytes[3] == 0x43) return 'flac'
  // WAV: 'RIFF....WAVE' —— 'RIFF' 在 0-3，'WAVE' 在 8-11
  if (bytes.length >= 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46) {
    if (bytes[8] == 0x57 && bytes[9] == 0x41 && bytes[10] == 0x56 && bytes[11] == 0x45) return 'wav'
  }
  // APE: 'MAC '
  if (bytes[0] == 0x4d && bytes[1] == 0x41 && bytes[2] == 0x43 && bytes[3] == 0x20) return 'ape'
  // MP3: MPEG 同步字 0xFF ??（?? 的 3 个文件标志位全为 1，即 & 0xE0 == 0xE0），或 'ID3' 头
  if (bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0) return 'mp3'
  if (bytes.length >= 3 && bytes[0] == 0x49 && bytes[1] == 0x44 && bytes[2] == 0x33) return 'mp3'
  return null
}

/**
 * 音质选对了但音源给的字节是别的格式。别落一个打不开的 .flac 到盘上。
 * 保留 expected / actual 让外层翻译成能看懂的话。
 */
class FormatMismatchError extends Error {
  expected: AnyListen.Music.FileType
  actual: AnyListen.Music.FileType
  constructor(expected: AnyListen.Music.FileType, actual: AnyListen.Music.FileType) {
    super('format mismatch')
    this.expected = expected
    this.actual = actual
  }
}

export const isBrowserTaskId = (id: string) => tasks.has(id)

export const listBrowserTasks = (): BrowserDownloadTask[] => [...tasks.values()]

/**
 * 把任务注册到内存 Map 中，用于 downloadWithBrowser 等不走 addBrowserDownload 流程的下载。
 * 只写入内存，不触发调度。
 */
export const registerBrowserTask = (task: BrowserDownloadTask) => {
  tasks.set(task.id, task)
}

export const unregisterBrowserTask = (id: string) => {
  tasks.delete(id)
}

/**
 * 只把历史读进内存，不自动开跑。
 * 下载依赖目录句柄的授权，而授权必须趁用户手势还在时重新申请，启动时申请不了，
 * 所以这里把上次跑一半的任务落回 waiting，等用户点重新下载或者重新授权目录。
 */
export const initBrowserDownload = async () => {
  if (inited || !canBrowserDownload()) return
  inited = true
  try {
    const stored = await getBrowserTasks()
    for (const task of stored) {
      const restored =
        task.status == DOWNLOAD_STATUS.RUN
          ? { ...task, status: DOWNLOAD_STATUS.WAITING, statusText: '', speed: '', isComplate: false }
          : task
      tasks.set(restored.id, restored)
    }
  } catch (err) {
    console.error('Restore browser download tasks failed:', err)
  }
}

// ---------------------------------------------------------------------------
// 目录
// ---------------------------------------------------------------------------

const getDownloadDir = () => getBrowserMeta<BrowserDirectoryHandle>(DIR_META_KEY)

// queryPermission / requestPermission 都可能在句柄失效时直接抛错，这里吞掉当没权限处理
const isDirGranted = async (dir: BrowserDirectoryHandle | null): Promise<boolean> => {
  if (!dir?.queryPermission) return false
  try {
    return (await dir.queryPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

const requestDirGrant = async (dir: BrowserDirectoryHandle | null): Promise<boolean> => {
  if (!dir?.requestPermission) return false
  try {
    return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

/** 当前选中的目录信息，设置页显示用 */
export const getBrowserDirInfo = async (): Promise<{ name: string; granted: boolean }> => {
  try {
    const dir = await getDownloadDir()
    if (!dir) return { name: '', granted: false }
    return { name: dir.name, granted: await isDirGranted(dir) }
  } catch {
    return { name: '', granted: false }
  }
}

/**
 * 弹系统目录选择框。必须在用户手势里调，浏览器只允许手势里拿句柄。
 * 选完把句柄存下来，下次开页面不用再选。
 *
 * 拿不到目录一律返回 null，不往外抛：
 * - 用户取消会抛 NotAllowedError
 * - Chrome 禁止选系统文件夹（下载 / 桌面 / 文档这些 Windows 已知文件夹），
 *   会弹它自己的「无法打开此文件夹」提示后同样抛 NotAllowedError
 *   两种情况拿不到 error 内容，上层只能给一句通用指引
 */
export const pickBrowserDownloadDir = async (): Promise<BrowserDirectoryHandle | null> => {
  if (!canBrowserDownload()) return null
  const picker = (window as BrowserPickerWindow).showDirectoryPicker
  if (!picker) return null
  let dir: BrowserDirectoryHandle | null = null
  try {
    dir = await picker.call(window, { mode: 'readwrite' })
  } catch (err) {
    console.error('Pick download directory failed:', err)
    return null
  }
  if (!dir) return null
  await setBrowserMeta(DIR_META_KEY, dir).catch(() => {})
  return dir
}

/**
 * 下载前确认目录可用。权限要趁用户手势还在的时候申请，
 * 排队中晚点再申请就没了，所以这里在入队之前调。
 */
const ensureDownloadDir = async (): Promise<BrowserDirectoryHandle | null> => {
  const dir = await getDownloadDir()
  if (!dir) return null
  if (await isDirGranted(dir)) return dir
  if (await requestDirGrant(dir)) return dir
  return null
}

const getFileExt = (quality: string): AnyListen.Download.FileExt => {
  const type = getFileType(quality)
  // getFileType 可能返回 m4a，下载列表的 ext 里只有 mp3 / flac / wav / ape
  return type == 'm4a' ? 'mp3' : type
}

const buildFileName = (
  musicInfo: AnyListen.Music.MusicInfoOnline,
  fileNameSetting: AnyListen.AppSetting['download.fileName'],
  ext: AnyListen.Download.FileExt
): string => {
  const raw = buildMusicName(fileNameSetting, musicInfo.name, musicInfo.singer)
  const name = raw.replace(ILLEGAL_FILENAME_CHARS, '').replace(/[.\s]+$/g, '').trim() || musicInfo.name
  return `${name}.${ext}`
}

/** 同名文件追加 (n)，和服务端 buildFilePath 的行为一致 */
const createFileHandle = async (dir: BrowserDirectoryHandle, fileName: string): Promise<BrowserFileHandle> => {
  if (!dir.getFileHandle) throw new Error(i18n.t('download.browser.unsupported'))
  // getFileHandle({create:false}) 在文件不存在时抛 NotFoundError，不是返回 null；
  // 得用 try/catch 探测存在性，不能靠 falsy 判断。
  // 必须通过 dir.getFileHandle(...) 调用，把方法摘出来会丢 this，手机上直接 Illegal invocation。
  const exists = async (name: string) => {
    try {
      await dir.getFileHandle(name, { create: false })
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name == 'NotFoundError') return false
      throw err
    }
  }
  const create = async (name: string) => {
    if (await exists(name)) return null
    const file = await dir.getFileHandle(name, { create: true })
    if (!file) throw new Error(i18n.t('download.browser.unsupported'))
    return file
  }
  const file = await create(fileName)
  if (file) return file
  const base = fileName.replace(/\.[^.]+$/, '')
  const ext = fileName.match(/\.[^.]+$/)?.[0] ?? ''
  for (let index = 1; ; index++) {
    const next = await create(`${base}(${index})${ext}`)
    if (next) return next
  }
}

// ---------------------------------------------------------------------------
// 任务
// ---------------------------------------------------------------------------

const createTask = (info: AddBrowserDownloadInfo): BrowserDownloadTask => {
  const ext = getFileExt(info.quality)
  return {
    id: buildMusicCacheId(info.musicInfo, info.quality),
    isComplate: false,
    status: DOWNLOAD_STATUS.WAITING,
    statusText: '',
    downloaded: 0,
    total: 0,
    writeQueue: 0,
    progress: 0,
    speed: '',
    timestamp: Date.now(),
    metadata: {
      musicInfo: info.musicInfo,
      url: null,
      quality: info.quality,
      ext,
      fileName: buildFileName(info.musicInfo, settingState.setting['download.fileName'], ext),
      filePath: '',
    },
  }
}

const updateTask = async (
  id: string,
  patch: BrowserTaskPatch,
  action?: AnyListen.Download.DownloadTaskActions
) => {
  const task = tasks.get(id)
  if (!task) return
  const next = { ...task, ...patch, metadata: { ...task.metadata, ...patch.metadata } }
  tasks.set(id, next)
  browserTaskUpdated.emit(id, patch)
  if (action) {
    browserTaskEvent.emit({
      id,
      action,
      display: { name: task.metadata.musicInfo.name, singer: task.metadata.musicInfo.singer },
    })
  }
  await saveBrowserTask(next).catch((err) => console.error('Save browser download task failed:', err))
}

/** 页面里没有断点续传的条件（句柄权限丢了就得重新授权），一律从头下 */
const downloadOne = async (id: string) => {
  const task = tasks.get(id)
  if (!task || cancelIds.has(id)) return

  const dir = await getDownloadDir()
  if (!dir) {
    await updateTask(
      id,
      { status: DOWNLOAD_STATUS.ERROR, statusText: i18n.t('download.browser.no_dir') },
      { action: 'error', data: { message: i18n.t('download.browser.no_dir') } }
    )
    return
  }
  const granted = await isDirGranted(dir)
  if (!granted) {
    await updateTask(
      id,
      { status: DOWNLOAD_STATUS.ERROR, statusText: i18n.t('download.browser.no_permission') },
      { action: 'error', data: { message: i18n.t('download.browser.no_permission') } }
    )
    return
  }

  await updateTask(
    id,
    {
      status: DOWNLOAD_STATUS.RUN,
      statusText: '',
      speed: '',
      progress: 0,
      downloaded: 0,
      total: 0,
    },
    { action: 'start' }
  )

  const controller = new AbortController()
  controllers.set(id, controller)
  let writable: BrowserWritable | null = null
  let urlInfo: AnyListen.IPCMusic.MusicUrlInfo | null = null

  try {
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      if (cancelIds.has(id)) return

      let downloaded = 0
      let total = 0

      try {
        if (!urlInfo) {
          urlInfo = await getMusicUrl({
            musicInfo: task.metadata.musicInfo,
            quality: task.metadata.quality,
            isRefresh: attempt > 0,
          })

          // URL 后缀能提前看出问题：请求 flac24bit 却给个 .mp3 直链。
          // 不匹配就直接中断，别下完了才发现存出来的是假 .flac。
          const urlFormat = detectFormatFromUrl(urlInfo.url)
          if (urlFormat && urlFormat != task.metadata.ext) {
            throw new FormatMismatchError(task.metadata.ext, urlFormat)
          }
        }

        let file
        file = await createFileHandle(dir, task.metadata.fileName)
        if (!file.createWritable) throw new Error(i18n.t('download.browser.unsupported'))
        writable = await file.createWritable()
        try {
          await writable.truncate(0)
          await writable.seek(0)
        } catch {
          // 有些浏览器不支持 truncate/seek，忽略
        }

        const fetchUrl = buildUrl(urlInfo.url, true, appState.proxyServerHost)
        let response
        response = await fetch(fetchUrl, {
          method: 'GET',
          signal: controller.signal,
        })
        if (!response.ok || !response.body) {
          throw new Error(`request error: ${response.status}`)
        }

        total = Number(response.headers.get('content-length') ?? 0)
        await updateTask(id, {
          total,
          metadata: { url: urlInfo.url, filePath: `${dir.name}/${file.name}` },
        })

        const reader = response.body.getReader()
        let lastProgressTime = 0
        let lastProgressBytes = 0
        let lastSpeedTime = Date.now()
        let chunkCount = 0

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (cancelIds.has(id)) return
          // URL 后缀能蒙混过关：扩展把真 mp3 藏在一个没有后缀的代理地址后面。
          // 拿到首块字节用魔数验一次，蒙不掉。
          if (chunkCount == 0) {
            const detected = detectFormatFromBytes(value)
            if (detected && detected != task.metadata.ext) {
              throw new FormatMismatchError(task.metadata.ext, detected)
            }
          }
          await writable.write(value)
          downloaded += value.byteLength
          chunkCount++

          const now = Date.now()
          if (now - lastProgressTime >= PROGRESS_INTERVAL) {
            const elapsed = (now - lastSpeedTime) / 1000
            const speed =
              elapsed > 0 ? sizeFormate(Math.round((downloaded - lastProgressBytes) / elapsed)) + '/s' : ''
            const progress = total > 0 ? Math.min(100, (downloaded / total) * 100) : 0
            await updateTask(
              id,
              { progress, downloaded, speed },
              { action: 'progress', data: { progress, speed, downloaded, total, writeQueue: 0 } }
            )
            lastProgressTime = now
            lastProgressBytes = downloaded
            lastSpeedTime = now
          }
        }
      } catch (err) {
        if (cancelIds.has(id)) return
        await writable?.close().catch(() => {})
        writable = null
        if (err instanceof DOMException && err.name == 'NotFoundError') {
          const msg = i18n.t('download.browser.dir_invalid')
          await updateTask(id, { status: DOWNLOAD_STATUS.ERROR, speed: '', statusText: msg }, {
            action: 'error',
            data: { message: msg },
          })
          return
        }
        // 格式不匹配是扩展在给假音质，重试拿的还是同一个假 URL。别浪费带宽。
        if (err instanceof FormatMismatchError) {
          const msg = i18n.t('download.reason.format_mismatch', {
            expected: err.expected,
            actual: err.actual,
          })
          await updateTask(id, { status: DOWNLOAD_STATUS.ERROR, speed: '', statusText: msg }, {
            action: 'error',
            data: { message: msg },
          })
          return
        }
        if (attempt < MAX_RETRY) {
          urlInfo = null
          await updateTask(id, { metadata: { url: null }, progress: 0, downloaded: 0 }, {
            action: 'refreshUrl',
          })
          continue
        }
        const message = err instanceof Error ? err.message : String(err)
        await updateTask(id, { status: DOWNLOAD_STATUS.ERROR, speed: '', statusText: message }, {
          action: 'error',
          data: { message },
        })
        return
      }

      await writable.close()
      await updateTask(
        id,
        {
          status: DOWNLOAD_STATUS.COMPLETED,
          isComplate: true,
          progress: 100,
          speed: '',
          total: total > 0 ? total : downloaded,
          downloaded,
        },
        { action: 'complete' }
      )
      return
    }
  } finally {
    controllers.delete(id)
  }
}

const runTask = async (id: string) => {
  if (runningIds.has(id)) return
  runningIds.add(id)
  try {
    await downloadOne(id)
  } catch (err) {
    console.error(`Browser download task ${id} failed:`, err)
  } finally {
    runningIds.delete(id)
    cancelIds.delete(id)
    schedule()
  }
}

const schedule = () => {
  while (runningIds.size < MAX_CONCURRENT && waitingIds.length) {
    const id = waitingIds.shift()!
    if (cancelIds.has(id)) {
      cancelIds.delete(id)
      continue
    }
    void runTask(id)
  }
}

/**
 * 删掉任务留下的半成品。已完成的那份是用户自己的文件，删记录不动它。
 * 浏览器拿不到任意删除的权限，这里只是尽力而为。
 */
const removeBrowserTaskFile = async (task: BrowserDownloadTask) => {
  if (task.status == DOWNLOAD_STATUS.COMPLETED) return
  const filePath = task.metadata.filePath
  if (!filePath) return
  const dir = await getDownloadDir()
  // filePath 记的是「目录名/文件名」，只认当前选中的那个目录，避免误删别的目录里的同名文件
  if (!dir || dir.name != filePath.split('/')[0]) return
  if (!dir.removeEntry) return
  // removeEntry 收的是相对当前目录的路径，得把目录名前缀去掉
  await dir.removeEntry(filePath.slice(dir.name.length + 1)).catch(() => {})
}

const addTasks = async (created: BrowserDownloadTask[]) => {
  if (!created.length) return false
  for (const task of created) tasks.set(task.id, task)
  await Promise.all(created.map((task) => saveBrowserTask(task).catch(() => {})))
  browserTaskListChanged.emit()
  return true
}

/**
 * 没有目录权限时不能弹选择框——授权必须在用户手势里申请，而这里的调用链已经离开手势了。
 * 所以任务先落成失败状态，把「去哪授权」说清楚，而不是静默丢进队列里永远不跑。
 */
const addFailedTasks = async (created: BrowserDownloadTask[]) => {
  const reason = i18n.t('download.browser.no_dir')
  const failed = created.map((task) => ({
    ...task,
    status: DOWNLOAD_STATUS.ERROR,
    statusText: reason,
  }))
  for (const task of failed) tasks.set(task.id, task)
  await Promise.all(failed.map((task) => saveBrowserTask(task).catch(() => {})))
  browserTaskListChanged.emit()
  for (const task of failed) {
    browserTaskEvent.emit({
      id: task.id,
      action: { action: 'error', data: { message: reason } },
      display: { name: task.metadata.musicInfo.name, singer: task.metadata.musicInfo.singer },
    })
  }
  return created.length > 0
}

export const addBrowserDownload = async (infos: AddBrowserDownloadInfo[]) => {
  if (!infos.length || !canBrowserDownload()) return
  const created = infos.map(createTask).filter((task) => !tasks.has(task.id))
  if (!created.length) return
  const dir = await ensureDownloadDir()
  if (!dir) {
    await addFailedTasks(created)
    return
  }
  await addTasks(created)
  waitingIds.push(...created.map((task) => task.id))
  schedule()
}

/** 语义和服务端 retryMusic 一致：完成过的任务重新下，同名文件自动追加序号 */
export const retryBrowserDownload = async (ids: string[]) => {
  let added = 0
  for (const id of ids) {
    if (!tasks.has(id) || runningIds.has(id) || cancelIds.has(id)) continue
    if (waitingIds.includes(id)) continue
    const task = tasks.get(id)
    if (!task) continue
    const restored = {
      ...task,
      status: DOWNLOAD_STATUS.WAITING,
      statusText: '',
      speed: '',
      isComplate: false,
      progress: 0,
      downloaded: 0,
      total: 0,
    }
    await updateTask(id, restored, { action: 'statusText', data: '' })
    waitingIds.push(id)
    added++
  }
  if (!added) return
  browserTaskListChanged.emit()
  await ensureDownloadDir()
  schedule()
}

export const cancelBrowserDownload = async (ids: string[]) => {
  for (const id of ids) {
    const index = waitingIds.indexOf(id)
    if (index > -1) waitingIds.splice(index, 1)
    cancelIds.add(id)
    controllers.get(id)?.abort()
    const task = tasks.get(id)
    if (task && (task.status == DOWNLOAD_STATUS.RUN || task.status == DOWNLOAD_STATUS.WAITING)) {
      await updateTask(id, { status: DOWNLOAD_STATUS.WAITING, statusText: '', speed: '' }, {
        action: 'statusText',
        data: '',
      })
    }
  }
  browserTaskListChanged.emit()
}

export const removeBrowserDownload = async (ids: string[]) => {
  if (!ids.length) return
  for (const id of ids) {
    const index = waitingIds.indexOf(id)
    if (index > -1) waitingIds.splice(index, 1)
    cancelIds.add(id)
    controllers.get(id)?.abort()
  }
  const targets = ids.map((id) => tasks.get(id)).filter((task): task is BrowserDownloadTask => !!task)
  await Promise.all(targets.map(removeBrowserTaskFile))
  for (const task of targets) tasks.delete(task.id)
  await removeBrowserTasks(ids).catch(() => {})
  browserTaskListChanged.emit()
}

export const clearBrowserDownload = async () => {
  waitingIds.length = 0
  // 先撤掉控制器，让在跑的任务尽快退出
  for (const id of controllers.keys()) controllers.get(id)?.abort()
  const targets = [...tasks.values()]
  await Promise.all(targets.map(removeBrowserTaskFile))
  for (const task of targets) tasks.delete(task.id)
  // 不在这儿清 cancelIds：还在跑的任务退出来会调 updateTask 落库，
  // 取消标记得留到 runTask 收尾时才撤，不然半成品记录会被写回去
  await clearBrowserTasks().catch(() => {})
  browserTaskListChanged.emit()
}

/** 只清已完成记录，不碰用户已经下载好的文件 */
export const clearBrowserDownloadCompleted = async () => {
  const ids = [...tasks.values()]
    .filter((task) => task.status == DOWNLOAD_STATUS.COMPLETED)
    .map((task) => task.id)
  if (!ids.length) return
  await removeBrowserDownload(ids)
}
