import { CANCELED_ERROR_MSG, DOWNLOAD_STATUS } from '@any-listen/common/constants'
import { buildMusicCacheId, buildMusicName, getFileType, VIRTUAL_PROTOCOL } from '@any-listen/common/tools'
import {
  checkAndCreateDir,
  checkPath,
  getFileStats,
  joinPath,
  normalizePath,
  removeFileIgnoreError,
} from '@any-listen/nodejs'
import { createDownload, type DownloaderType } from '@any-listen/nodejs/download'

import { proxyServerState } from '../proxyServer'
import { getMusicLyric } from '../resources/lyric'
import { getMusicPic } from '../resources/musicPic'
import { getMusicUrl } from '../resources/musicUrl'
import { getDownloadFilePath } from '../worker/utilService/shared/music'
import type { DBSeriveTypes } from '../worker/utils'

import { downloadEvent } from './event'
import { embedDownloadMetadata } from './embedMetadata'

/** 并发下载上限 */
const MAX_CONCURRENT = 3
/** URL 失效时的重试次数 */
const MAX_RETRY = 1
/** 同一任务进度事件的最小间隔，避免刷屏 */
const PROGRESS_INTERVAL = 500
/** 文件名里的非法字符 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1f]/g
/**
 * 写盘没权限是配置问题，重试多少次都一样。
 * 前端在 translateDownloadMessage 里换成能看懂的文案。
 */
const NO_WRITE_PERMISSION_MSG = 'No write permission to the download directory'

/**
 * 下载器回调带出来的结构化错误。onError / onFail 原本是两套信息
 * （本地错误码 vs HTTP 状态码），合并成一种异常才能在同一个地方分类。
 */
class DownloadError extends Error {
  status: number | undefined
  code: string | undefined
  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * 一个失败该怎么处理：
 * - refreshUrl：这条地址已经废了（401/403/410、DNS 解析不到），必须重新取 URL
 * - retry：地址没问题，原样重试；fresh 表示先删掉半成品，否则每次都拿同一份坏字节
 * - giveUp：重试也救不回来的配置类错误，直接报错
 */
type DownloadFailure =
  | { kind: 'refreshUrl' }
  | { kind: 'retry'; fresh?: boolean }
  | { kind: 'giveUp'; message: string }

const classifyFailure = (err: unknown): DownloadFailure => {
  if (!(err instanceof DownloadError)) return { kind: 'retry' }
  if (err.status == 401 || err.status == 403 || err.status == 410) return { kind: 'refreshUrl' }
  if (err.code == 'EPERM' || err.code == 'EACCES') return { kind: 'giveUp', message: NO_WRITE_PERMISSION_MSG }
  if (err.message?.startsWith('Resume failed')) return { kind: 'retry', fresh: true }
  if (err.code == 'ENOTFOUND') return { kind: 'refreshUrl' }
  return { kind: 'retry' }
}

/**
 * 下载模块需要的配置。由各端在初始化时注入（桌面 / web-server 的 appState 结构一致），
 * 这里不直接依赖某一端的 appState，和 player 的 initPlayer(_dbService, dataPath) 一个思路。
 */
export interface DownloadConfig {
  /** 用户配置的下载目录，空字符串表示用 fallbackSavePath/download */
  savePath: string
  fileName: AnyListen.AppSetting['download.fileName']
  /** 未配置下载目录时的回落根目录（通常是 appState.dataPath） */
  fallbackSavePath: string
  addMusicLocationType: AnyListen.AppSetting['list.addMusicLocationType']
  proxy: { host: string; port: string }
  embedMetadata: boolean
}

let dbService: DBSeriveTypes
let getConfig: () => DownloadConfig
let waitingIds: string[] = []
let runningIds = new Set<string>()
/** 已请求取消的任务，避免下载完成后又把状态写回 completed */
let cancelIds = new Set<string>()
let downloaders = new Map<string, DownloaderType>()
let progressTimes = new Map<string, number>()
let isInitialized = false

export const initDownload = (_dbService: DBSeriveTypes, _getConfig: () => DownloadConfig) => {
  if (isInitialized) return
  isInitialized = true
  dbService = _dbService
  getConfig = _getConfig
  // 恢复上次进程退出时未完成的任务，Downloader 支持断点续传
  const pending = dbService.getDownloadList()
    .then((list) => list.filter((task) => task.status == DOWNLOAD_STATUS.WAITING || task.status == DOWNLOAD_STATUS.RUN))
    .then((list) => {
      if (!list.length) return []
      return dbService.downloadInfoUpdate(list.map((task) => ({ ...task, status: DOWNLOAD_STATUS.WAITING, statusText: '' }))).then(() => list.map((task) => task.id))
    })
    .catch((err) => {
      console.error('Restore download tasks failed:', err)
      return []
    })
  void pending.then((ids) => {
    if (!ids.length) return
    waitingIds.push(...ids)
    schedule()
  })
}

export const getDownloadList = () => dbService.getDownloadList()

/**
 * 任务实际写入的目录。未配置保存路径时回落到 fallbackSavePath/download。
 * 和 downloadOne 里的取值保持一致，别在两边各写一份。
 */
const getSavePathDir = (): string => {
  const config = getConfig()
  return normalizePath(config.savePath || joinPath(config.fallbackSavePath, 'download'))
}

/**
 * 前端要拿它判断「设置的地址现在还能不能用」。比如换设备访问同一个 web-server、
 * 或者目录被删了，保存的路径就是失效的，得让用户重新选。
 */
export const getSavePathStatus = async (): Promise<AnyListen.IPCDownload.SavePathStatus> => {
  const savePath = getSavePathDir()
  return { savePath, exists: await checkPath(savePath) }
}

/**
 * 扩展返回的可能是 al-ps-host: 开头的代理地址（洛雪音源、WebDAV 都会用）。
 * 服务端 Node 直接下载不需要走 HTTP 反代——把真实地址和请求头拿出来喂给 Downloader 就行，
 * 播放时才靠 web-server 那个 /p_static 端点把虚拟地址翻回去。
 */
const resolveDownloadUrl = (url: string): { url: string; headers?: Record<string, string> } => {
  if (!url.startsWith(VIRTUAL_PROTOCOL)) return { url }
  const base = `${VIRTUAL_PROTOCOL}${proxyServerState.proxyBaseUrl}/`
  if (!url.startsWith(base)) return { url }
  const proxyInfo = proxyServerState.proxyMap.get(url.slice(base.length))
  if (!proxyInfo) return { url }
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(proxyInfo.requestOptions.headers ?? {})) {
    headers[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return { url: proxyInfo.url, headers: Object.keys(headers).length ? headers : undefined }
}

export const sendDownloadAction = async (action: AnyListen.IPCDownload.ActionList) => {
  switch (action.action) {
    case 'add_music':
      return addMusic(action.data)
    case 'remove':
      return removeMusic(action.data)
    case 'retry':
      return retryMusic(action.data)
    case 'cancel':
      return cancelMusic(action.data)
    case 'clear':
      return clearDownloadList()
  }
}

export { downloadEvent }

/**
 * 把任务状态变化桥接到 IPC。返回取消注册函数。
 */
export const onDownloadEvent = (push: (event: AnyListen.IPCDownload.TaskEvent) => void | Promise<void>): (() => void) => {
  const handler = (task: AnyListen.Download.ListItem, action: AnyListen.Download.DownloadTaskActions) =>
    push({
      id: task.id,
      action,
      display: {
        name: task.metadata.musicInfo.name,
        singer: task.metadata.musicInfo.singer,
      },
    })
  downloadEvent.on('task_updated', handler)
  return () => downloadEvent.off('task_updated', handler)
}

/**
 * 把「任务增删」桥接到 IPC。下载列表页靠它刷新，不用轮询。
 * 注意和 onDownloadEvent 分开注册：进度事件已经能单条更新，这里只处理整表变化。
 */
export const onDownloadListChanged = (push: () => void | Promise<void>): (() => void) => {
  downloadEvent.on('list_changed', push)
  return () => downloadEvent.off('list_changed', push)
}

const getTasks = async (): Promise<AnyListen.Download.ListItem[]> => dbService.getDownloadList()

const findTask = async (id: string): Promise<AnyListen.Download.ListItem | undefined> =>
  (await getTasks()).find((task) => task.id == id)

const persistTask = async (task: AnyListen.Download.ListItem, action?: AnyListen.Download.DownloadTaskActions) => {
  await dbService.downloadInfoUpdate([task])
  if (action) downloadEvent.task_updated(task, action)
  return task
}

const buildFileName = (musicInfo: AnyListen.Music.MusicInfoOnline, fileNameSetting: DownloadConfig['fileName'], ext: AnyListen.Download.FileExt): string => {
  const raw = buildMusicName(fileNameSetting, musicInfo.name, musicInfo.singer)
  const name = raw.replace(ILLEGAL_FILENAME_CHARS, '').replace(/[.\s]+$/g, '').trim() || musicInfo.name
  return `${name}.${ext}`
}

/**
 * 同名文件追加 (n)，已有 filePath 时直接复用，让断点续传和重试落到同一个文件上。
 * 上次被强杀留下的空文件算没下过，直接覆盖，别替它追加序号白下第二遍。
 */
const buildFilePath = async (fileName: string, dir: string): Promise<string> => {
  let filePath = joinPath(dir, fileName)
  const stats = await getFileStats(filePath)
  if (!stats || stats.size == 0) return filePath
  const base = fileName.replace(/\.[^.]+$/, '')
  const ext = fileName.match(/\.[^.]+$/)?.[0] ?? ''
  for (let index = 1; ; index++) {
    filePath = joinPath(dir, `${base}(${index})${ext}`)
    const candidate = await getFileStats(filePath)
    if (!candidate || candidate.size == 0) return filePath
  }
}

const getFileExt = (quality: string): AnyListen.Download.FileExt => {
  const type = getFileType(quality)
  // getFileType 可能返回 m4a，下载列表的 ext 里只有 mp3 / flac / wav / ape
  return type == 'm4a' ? 'mp3' : type
}

const createTask = (info: AnyListen.IPCDownload.AddMusicInfo): AnyListen.Download.ListItem => {
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
      fileName: buildFileName(info.musicInfo, getConfig().fileName, ext),
      filePath: '',
    },
  }
}

const handleProgress = async (id: string, progress: AnyListen.Download.ProgressInfo) => {
  const now = Date.now()
  if (now - (progressTimes.get(id) ?? 0) < PROGRESS_INTERVAL) return
  progressTimes.set(id, now)
  const task = await findTask(id)
  if (!task) return
  await persistTask(
    {
      ...task,
      downloaded: progress.downloaded,
      total: progress.total,
      writeQueue: progress.writeQueue,
      progress: progress.progress,
      speed: progress.speed,
    },
    { action: 'progress', data: progress }
  )
}

const downloadFile = (
  id: string,
  url: string,
  filePath: string,
  proxy?: { host: string; port: number },
  headers?: Record<string, string>
) => {
  return new Promise<void>((resolve, reject) => {
    const settle = () => downloaders.delete(id)
    const dl = createDownload({
      url,
      path: filePath,
      proxy,
      headers,
      onProgress: (progress) => {
        void handleProgress(id, progress)
      },
      onCompleted() {
        settle()
        resolve()
      },
      onError(err) {
        settle()
        reject(new DownloadError(err.message || String(err), undefined, (err as { code?: string }).code))
      },
      onFail(resp) {
        settle()
        reject(new DownloadError(`Request failed: ${resp.statusMessage || resp.statusCode}`, resp.statusCode))
      },
      onStop() {
        settle()
        reject(new Error(CANCELED_ERROR_MSG))
      },
    })
    downloaders.set(id, dl)
  })
}

/** 停掉一个正在跑的下载器，不落任何磁盘动作 */
const stopTask = async (id: string) => {
  cancelIds.add(id)
  const dl = downloaders.get(id)
  if (dl) {
    downloaders.delete(id)
    try {
      await dl.stop()
    } catch {}
  }
}

/**
 * 删掉任务落盘的文件。已完成的那份是用户明确要留的成果，删记录不动它；
 * 只清理进行中 / 失败留下的半成品。
 */
const removeTaskFile = (task: AnyListen.Download.ListItem) => {
  if (task.status == DOWNLOAD_STATUS.COMPLETED) return
  if (!task.metadata.filePath) return
  return removeFileIgnoreError(task.metadata.filePath)
}

const downloadOne = async (id: string) => {
  let task = await findTask(id)
  if (!task) return
  if (cancelIds.has(id)) return

  const config = getConfig()
  const dir = getSavePathDir()
  const type = getFileType(task.metadata.quality)
  const proxy = config.proxy.host && config.proxy.port ? { host: config.proxy.host, port: Number(config.proxy.port) } : undefined

  task = await persistTask({ ...task, status: DOWNLOAD_STATUS.RUN }, { action: 'start' })
  if (cancelIds.has(id)) return

  // 上次已经下完、文件还在盘上的任务不重复下载
  const existingPath = await getDownloadFilePath(task, dir)
  if (existingPath) {
    await persistTask(
      { ...task, status: DOWNLOAD_STATUS.COMPLETED, isComplate: true, progress: 100, metadata: { ...task.metadata, filePath: existingPath } },
      { action: 'complete' },
    )
    return
  }

  await checkAndCreateDir(dir)

  let urlInfo: AnyListen.IPCExtension.MusicUrlInfo | null = null
  let filePath = task.metadata.filePath
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      if (!urlInfo) {
        urlInfo = await getMusicUrl({
          musicInfo: task.metadata.musicInfo,
          quality: task.metadata.quality,
          type,
        })
      }
      if (!filePath) filePath = await buildFilePath(task.metadata.fileName, dir)
      // al-ps-host: 代理地址在解析出真实 URL 之前先不落库，避免把虚拟地址写进记录
      const resolved = resolveDownloadUrl(urlInfo.url)
      if (!/^https?:\/\//.test(resolved.url)) {
        throw new Error('Music url is not http(s)')
      }
      task = await persistTask({ ...task, metadata: { ...task.metadata, url: resolved.url, filePath } })
      if (cancelIds.has(id)) return
      await downloadFile(id, resolved.url, filePath, proxy, resolved.headers)
      await persistTask(
        {
          ...task,
          status: DOWNLOAD_STATUS.COMPLETED,
          isComplate: true,
          progress: 100,
          speed: '',
          metadata: { ...task.metadata, filePath },
        },
        { action: 'complete' }
      )
      void embedDownloadMetadata(task, config).catch(() => {})
      return
    } catch (err) {
      if (cancelIds.has(id)) return
      const failure = classifyFailure(err)
      const message = failure.kind == 'giveUp' ? failure.message : err instanceof Error ? err.message : String(err)
      if (failure.kind == 'giveUp') {
        await persistTask({ ...task, status: DOWNLOAD_STATUS.ERROR, speed: '', statusText: message }, { action: 'error', data: { message } })
        return
      }
      if (attempt < MAX_RETRY) {
        // 续传失败是本地半成品和远端对不上，不删掉重来的话重试只是在撞同一份坏字节
        let nextPath = filePath
        if (failure.kind == 'retry' && failure.fresh && filePath) {
          await removeFileIgnoreError(filePath)
          nextPath = ''
        }
        filePath = nextPath
        await persistTask(
          { ...task, metadata: { ...task.metadata, url: null, filePath: nextPath } },
          { action: 'refreshUrl' },
        )
        urlInfo = null
        continue
      }
      await persistTask({ ...task, status: DOWNLOAD_STATUS.ERROR, speed: '', statusText: message }, { action: 'error', data: { message } })
      return
    }
  }
}

const runTask = async (id: string) => {
  if (runningIds.has(id)) return
  runningIds.add(id)
  try {
    await downloadOne(id)
  } catch (err) {
    console.error(`Download task ${id} failed:`, err)
  } finally {
    runningIds.delete(id)
    progressTimes.delete(id)
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

const addMusic = async (infos: AnyListen.IPCDownload.AddMusicInfo[]) => {
  if (!infos.length) return
  const existingIds = new Set((await getTasks()).map((task) => task.id))
  const tasks = infos
    .map(createTask)
    .filter((task) => !existingIds.has(task.id))
  if (!tasks.length) return
  await dbService.downloadInfoSave(tasks, getConfig().addMusicLocationType)
  downloadEvent.list_changed()
  waitingIds.push(...tasks.map((task) => task.id))
  schedule()
}

const cancelMusic = async (ids: string[]) => {
  for (const id of ids) {
    const index = waitingIds.indexOf(id)
    if (index > -1) waitingIds.splice(index, 1)
    await stopTask(id)
    // 下载器停了之后任务不能还挂着 run，落回 waiting 表示「没在下载」，也方便之后重新下载
    const task = await findTask(id)
    if (task && (task.status == DOWNLOAD_STATUS.RUN || task.status == DOWNLOAD_STATUS.WAITING)) {
      await persistTask({ ...task, status: DOWNLOAD_STATUS.WAITING, statusText: '', speed: '' }, {
        action: 'statusText',
        data: '',
      })
    }
  }
  downloadEvent.list_changed()
}

/**
 * 重跑一批任务。两种语义：
 * - 失败 / 已取消：清掉状态重下，文件路径沿用，断点续传能接上。
 * - 已完成：当成全新一次，清空 isComplate / 进度 / filePath，重新走 buildFilePath，
 *   同名文件自动追加 (n)，不会覆盖原来那份。
 */
const retryMusic = async (ids: string[]) => {
  let added = 0
  for (const id of ids) {
    if (runningIds.has(id) || cancelIds.has(id)) continue
    if (waitingIds.includes(id)) continue
    const task = await findTask(id)
    if (!task) continue
    const redownload = task.status == DOWNLOAD_STATUS.COMPLETED
    await persistTask(
      {
        ...task,
        status: DOWNLOAD_STATUS.WAITING,
        statusText: '',
        speed: '',
        isComplate: false,
        progress: 0,
        downloaded: 0,
        total: 0,
        metadata: { ...task.metadata, url: null, filePath: redownload ? '' : task.metadata.filePath },
      },
      { action: 'statusText', data: '' }
    )
    waitingIds.push(id)
    added++
  }
  if (!added) return
  downloadEvent.list_changed()
  schedule()
}

const removeMusic = async (ids: string[]) => {
  if (!ids.length) return
  for (const id of ids) {
    const index = waitingIds.indexOf(id)
    if (index > -1) waitingIds.splice(index, 1)
  }
  const tasks = (await getTasks()).filter((task) => ids.includes(task.id))
  for (const task of tasks) await stopTask(task.id)
  await Promise.all(tasks.map((task) => removeTaskFile(task)))
  await dbService.downloadInfoRemove(ids)
  downloadEvent.list_changed()
}

const clearDownloadList = async () => {
  const tasks = await getTasks()
  waitingIds = []
  for (const task of tasks) await stopTask(task.id)
  await Promise.all(tasks.map((task) => removeTaskFile(task)))
  cancelIds.clear()
  runningIds.clear()
  progressTimes.clear()
  downloaders.clear()
  await dbService.downloadInfoClear()
  downloadEvent.list_changed()
}

/**
 * 浏览器直存模式下，获取用于嵌入元数据的数据。
 * 服务端负责获取歌词，封面 URL 直接返回，浏览器侧再下载封面并嵌入。
 */
export const getEmbedData = async (musicInfo: AnyListen.Music.MusicInfoOnline): Promise<{
  coverUrl: string | null
  lyric: string | null
  title: string
  artist: string
  album: string
  year?: number
  trackNo?: number | null
  discNo?: number | null
}> => {
  const lyricInfo = await getMusicLyric({ musicInfo }).catch(() => null)
  const meta = musicInfo.meta ?? {}

  // meta.picUrl 只有在播放器请求过封面后才设，下载时用扩展重新取
  let coverUrl = meta.picUrl ?? null
  if (!coverUrl) {
    try {
      coverUrl = await getMusicPic({ musicInfo })
    } catch {
      coverUrl = null
    }
  }

  return {
    coverUrl,
    lyric: lyricInfo?.lyric ?? null,
    title: musicInfo.name ?? '',
    artist: musicInfo.singer ?? '',
    album: meta.albumName ?? '',
    year: meta.year,
    trackNo: meta.trackNo,
    discNo: meta.discNo,
  }
}
