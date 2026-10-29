import { DOWNLOAD_STATUS } from '@any-listen/common/constants'
import { buildMusicCacheId, buildMusicName, getFileType } from '@any-listen/common/tools'
import { buildUrl, createTaggedBlob } from '@any-listen/web'

import { showDownloadQualityModal } from '@/components/apis/downloadQualityModal'
import { hideNotify, showNotify, updateNotify } from '@/components/apis/notify'
import { i18n } from '@/plugins/i18n'
import { sizeFormate } from '@/shared'

import { appState } from '../app/store/state'
import { getBestQuality } from '../player/utils/quality'
import { settingState } from '../setting/store/state'
import {
  beginDownloading,
  completeDownloadProgress,
  failDownloadProgress,
  startDownloadProgress,
  updateDownloadProgress,
} from './progress/store.svelte'
import { getEmbedData, getSavePathStatus, sendDownloadAction } from '../../shared/ipc/download'
import { downloadEventIPC } from '../../shared/ipc/download/event'
import {
  addBrowserDownload,
  browserTaskEvent,
  browserTaskListChanged,
  browserTaskUpdated,
  canBrowserDownload,
  detectFormatFromBytes,
  getBrowserDirInfo,
  registerBrowserTask,
} from './browser'
import { saveBrowserTask } from './browser/db'
import { initDownloadList, retryDownload as originalRetryDownload } from './store/action'
import { downloadListState } from './store/state'

export * from './store/action'

// Web 版重试：使用与初次下载相同的浏览器下载逻辑，而非 File System Access API
export const retryDownload = (ids: string[]) => {
  if (!ids.length) return
  if (import.meta.env.VITE_IS_WEB) {
    const tasks = downloadListState.list.filter((task) => ids.includes(task.id))
    if (tasks.length) {
      void downloadWithBrowser(
        tasks.map((task) => ({
          musicInfo: task.metadata.musicInfo,
          quality: task.metadata.quality,
        }))
      )
    }
    return
  }
  originalRetryDownload(ids)
}

/**
 * 下载进行中的通知不自动消失，给个足够长的兜底时间，正常会在完成/失败时手动关掉。
 */
const RUNNING_NOTIFY_DURATION = 3600
/**
 * 结束通知停留多久后自动消失
 */
const DONE_NOTIFY_DURATION = 6

// taskId -> 通知 id
const notifyIds = new Map<string, string>()

const displayName = (event: AnyListen.IPCDownload.TaskEvent): string =>
  event.display.singer ? `${event.display.name} - ${event.display.singer}` : event.display.name

const finishNotify = (taskId: string, notifyId?: string) => {
  notifyIds.delete(taskId)
  if (!notifyId) return
  setTimeout(() => {
    hideNotify(notifyId)
  }, DONE_NOTIFY_DURATION * 1000)
}

const handleEvent = (event: AnyListen.IPCDownload.TaskEvent) => {
  const notifyId = notifyIds.get(event.id)
  const name = displayName(event)
  const action = event.action
  switch (action.action) {
    case 'start': {
      const id = showNotify(i18n.t('download.start_notify', { name }), RUNNING_NOTIFY_DURATION)
      if (id) notifyIds.set(event.id, id)
      break
    }
    case 'progress': {
      if (!notifyId) return
      const progress = action.data
      updateNotify(
        notifyId,
        i18n.t('download.progress_notify', {
          name,
          progress: progress.progress.toFixed(1),
          speed: progress.speed,
        }),
      )
      break
    }
    case 'complete': {
      if (notifyId) updateNotify(notifyId, i18n.t('download.complete_notify', { name }))
      finishNotify(event.id, notifyId)
      break
    }
    case 'error': {
      if (notifyId) {
        const reason = action.data.message ? translateDownloadMessage(action.data.message) : undefined
        updateNotify(notifyId, i18n.t('download.error_notify', { name }) + (reason ? ` - ${reason}` : ''))
      }
      finishNotify(event.id, notifyId)
      break
    }
  }
}

/**
 * 在 main.ts 里调一次：通知跟任务状态变化，列表跟任务增删。
 * 服务端任务从 IPC 来，浏览器直存任务从本地事件来，通知逻辑两边共用。
 */
export const initDownloadEvent = () => {
  downloadEventIPC.on(handleEvent)
  browserTaskEvent.on(handleEvent)
  void initDownloadList()
}

/**
 * 没拿到音质信息时回落到播放器设置的音质。
 */
const getDefaultQuality = (musicInfo: AnyListen.Music.MusicInfoOnline): string => {
  return getBestQuality(musicInfo)
}

/**
 * 本地歌曲文件本来就在盘上，没必要再下一遍。
 * al-ps-host: 代理地址由下载管理器自己翻成真实 URL（服务端）或者交给 web-server 代理（浏览器），
 * 所有非本地音源都能下，不用按来源名单黑名单。
 */
export const isDownloadable = (musicInfo: AnyListen.Music.MusicInfo): musicInfo is AnyListen.Music.MusicInfoOnline =>
  !musicInfo.isLocal

/**
 * 服务端抛的是英文串，列表和通知里换成能看懂的文案。
 * 已知的才翻，其余原样留出来，方便排查。
 */
export const translateDownloadMessage = (message: string): string => {
  if (message == 'Music url is not http(s)') return i18n.t('download.reason.not_http')
  if (message == 'Get music url failed') return i18n.t('download.reason.get_url_failed')
  if (message == 'Get url failed, no source') return i18n.t('download.reason.no_source')
  if (message == 'No write permission to the download directory') return i18n.t('download.reason.no_permission')
  return message
}

/**
 * 保存目录现在的状态，下载页和设置页都靠它提示「地址失效请重设」。
 * 两种模式的失效原因不一样：
 * - 服务端存的是服务器上的目录，换台设备连同一个服务时它可能压根不存在
 * - 浏览器直存存的是本机浏览器的目录句柄，换浏览器 / 换设备就没了，授权也会过期
 * valid 表示「现在还能不能往这个地址写」，false 就该让用户重新选。
 */
export const getDownloadSavePathStatus = async (): Promise<{ path: string; valid: boolean }> => {
  if (settingState.setting['download.mode'] == 'browser' && canBrowserDownload()) {
    const info = await getBrowserDirInfo()
    return { path: info.name, valid: !!info.name && info.granted }
  }
  try {
    const status = await getSavePathStatus()
    return { path: status.savePath, valid: status.exists }
  } catch {
    // IPC 还没连上时不能把状态当成失效，否则一开机就误报
    return { path: '', valid: true }
  }
}

/**
 * 把歌曲加入下载队列。单曲时弹音质选择，多选直接按各自可用的最高音质下。
 * 本地歌曲、WebDAV 代理源下不了，先过滤掉——多选时列表和右键的不是同一首，得在这儿兜住。
 */
export const addDownloadMusic = async (musicInfos: AnyListen.Music.MusicInfo[]) => {
  const targets = musicInfos.filter(isDownloadable)
  if (!targets.length) return
  const infos = targets.map((musicInfo) => ({
    musicInfo,
    quality: getDefaultQuality(musicInfo),
  }))
  if (infos.length == 1) {
    const first = infos[0]
    if (!first) return
    try {
      first.quality = await showDownloadQualityModal(first.musicInfo)
    } catch {
      return
    }
  }

  // Web 版：交给浏览器下载
  if (import.meta.env.VITE_IS_WEB) {
    await downloadWithBrowser(infos)
    return
  }

  // 桌面端浏览器直存：开了设置且浏览器支持 File System Access API 才走这条路
  if (settingState.setting['download.mode'] == 'browser' && canBrowserDownload()) {
    await addBrowserDownload(infos)
    return
  }
  await sendDownloadAction({ action: 'add_music', data: infos })
}

/**
 * Web 版下载：通过 fetch 流式下载文件内容，显示环形进度条。
 * 下载完成后创建 Blob URL 触发浏览器保存文件。
 * 同时创建下载记录，显示在下载页面历史中。
 */
const downloadWithBrowser = async (infos: Array<{ musicInfo: AnyListen.Music.MusicInfo; quality: string }>) => {
  const fileNameSetting = settingState.setting['download.fileName']
  const extMap: Record<string, AnyListen.Download.FileExt> = { m4a: 'mp3' }

  for (const info of infos) {
    // type/ext/fileName 中途可能被真实格式修正（音源给假音质时魔数会揭穿），用 let 声明
    let type = getFileType(info.quality)
    let ext = extMap[type] ?? type
    const raw = buildMusicName(fileNameSetting, info.musicInfo.name, info.musicInfo.singer)
    const rawBase = raw.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/[.\s]+$/g, '').trim() || info.musicInfo.name
    let fileName = `${rawBase}.${ext}`
    const taskId = buildMusicCacheId(info.musicInfo, info.quality)

    // 创建下载记录
    const task: AnyListen.Download.ListItem = {
      id: taskId,
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
        fileName,
        filePath: '',
      },
    }

    // 辅助函数：同时更新内存和 IndexedDB。
    // metadata 允许部分更新（如只改 url / ext / fileName），所以单独做成深度 partial。
    // 声明在 try 外：下载失败进 catch 也要能改任务状态（原代码声明在 try 里，
    // catch 里调用 updateTask 会 ReferenceError，导致失败任务永远停在 run 状态）。
    type ListItemPatch = Omit<Partial<AnyListen.Download.ListItem>, 'metadata'> & {
      metadata?: Partial<AnyListen.Download.ListItem['metadata']>
    }
    const updateTask = (patch: ListItemPatch) => {
      const updated = { ...task, ...patch, metadata: { ...task.metadata, ...patch.metadata } }
      task.status = updated.status
      task.statusText = updated.statusText
      task.downloaded = updated.downloaded
      task.total = updated.total
      task.writeQueue = updated.writeQueue
      task.progress = updated.progress
      task.speed = updated.speed
      task.isComplate = updated.isComplate
      task.metadata = updated.metadata
      registerBrowserTask(task)
      void saveBrowserTask(task)
      browserTaskUpdated.emit(taskId, patch)
    }

    // 立即显示进度条（准备中状态）
    const abortController = new AbortController()
    startDownloadProgress(fileName, abortController)

    try {
      // 注册到内存 + 保存任务记录
      registerBrowserTask(task)
      await saveBrowserTask(task)
      browserTaskUpdated.emit(taskId, task)
      browserTaskListChanged.emit()

      // 获取下载 URL
      const { getMusicUrl } = await import('@/shared/ipc/music')
      let urlInfo = await getMusicUrl({
        musicInfo: info.musicInfo,
        quality: info.quality,
        isRefresh: true,
      })
      let realUrl = buildUrl(urlInfo.url, true, appState.proxyServerHost)

      // 更新任务状态为下载中
      updateTask({ status: DOWNLOAD_STATUS.RUN, metadata: { url: urlInfo.url } })
      beginDownloading()

      // 请求文件，失败时刷新 URL 重试
      let response = await fetch(realUrl, { signal: abortController.signal })
      if (!response.ok) {
        urlInfo = await getMusicUrl({
          musicInfo: info.musicInfo,
          quality: info.quality,
          isRefresh: true,
        })
        realUrl = buildUrl(urlInfo.url, true, appState.proxyServerHost)
        response = await fetch(realUrl, { signal: abortController.signal })
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const contentLength = Number(response.headers.get('content-length') ?? 0)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      // 更新任务 total
      updateTask({ total: contentLength })

      // 开始流式读取
      const chunks: Uint8Array[] = []
      let receivedLength = 0
      let lastSpeedTime = Date.now()
      let lastReceivedLength = 0
      let lastProgressTime = 0
      let chunkCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (abortController.signal.aborted) break

        // 拿首块字节用魔数验一次真实格式：音源可能请求 flac 却给 mp3 直链，
        // URL 后缀能蒙混过关（代理地址没后缀），文件头蒙不掉。
        // 检测到和所选音质不符就用真实格式保存，别把假 .flac 落盘。
        if (chunkCount == 0) {
          const detected = detectFormatFromBytes(value)
          if (detected && detected != type) {
            console.warn(
              `[download] quality ${info.quality} expected ${type} but got ${detected}, saving as ${detected}`
            )
            type = detected
            ext = extMap[type] ?? type
            fileName = `${rawBase}.${ext}`
            updateTask({ metadata: { ext, fileName } })
            showNotify(
              i18n.t('download.browser.format_corrected', {
                name: info.musicInfo.name,
                actual: detected,
              })
            )
          }
        }
        chunkCount++

        chunks.push(value)
        receivedLength += value.byteLength

        const now = Date.now()
        const progress = contentLength > 0 ? Math.min(100, (receivedLength / contentLength) * 100) : 0
        const elapsed = (now - lastSpeedTime) / 1000
        const speed = elapsed > 0 ? sizeFormate(Math.round((receivedLength - lastReceivedLength) / elapsed)) + '/s' : ''

        // 每 300ms 更新一次进度条，避免文字闪烁
        if (now - lastProgressTime >= 300) {
          updateDownloadProgress(progress, speed)
          updateTask({ progress, downloaded: receivedLength, speed, total: contentLength })
          lastProgressTime = now
          lastReceivedLength = receivedLength
          lastSpeedTime = now
        }
      }

      // 最终更新一次进度到 100%
      updateDownloadProgress(100, '')

      // 嵌入元数据（封面 + 歌词）到内存中的文件数据
      let blob: Blob
      const embedEnabled = true
      if (embedEnabled) {
        try {
          console.log('[download] getEmbedData called for:', info.musicInfo.name)
          const embedData = await getEmbedData(info.musicInfo)
          console.log('[download] embedData:', {
            coverUrl: embedData.coverUrl ? 'yes' : 'no',
            title: embedData.title || '(empty)',
            artist: embedData.artist || '(empty)',
            album: embedData.album || '(empty)',
            lyric: embedData.lyric ? `${embedData.lyric.length} chars` : 'none',
          })
          let picture: Uint8Array | null = null
          if (embedData.coverUrl) {
            const coverUrl = buildUrl(embedData.coverUrl, true, appState.proxyServerHost)
            console.log('[download] fetching cover:', coverUrl)
            const coverResponse = await fetch(coverUrl)
            if (coverResponse.ok) {
              picture = new Uint8Array(await coverResponse.arrayBuffer())
              console.log('[download] cover fetched, size:', picture.length)
            } else {
              console.warn('[download] cover fetch failed:', coverResponse.status)
            }
          }
          blob = await createTaggedBlob(chunks, ext, {
            title: embedData.title,
            artist: embedData.artist,
            album: embedData.album,
            year: embedData.year,
            trackNo: embedData.trackNo,
            discNo: embedData.discNo,
            picture,
            lyric: embedData.lyric,
          })
          console.log('[download] createTaggedBlob done, blob size:', blob.size)
        } catch (err) {
          console.error('Embed metadata failed, using raw file:', err instanceof Error ? err.message : err)
          blob = new Blob(chunks as BlobPart[])
        }
      } else {
        blob = new Blob(chunks as BlobPart[])
      }

      // 下载完成，创建 Blob URL 并显示完成状态
      const blobUrl = URL.createObjectURL(blob)
      completeDownloadProgress(blobUrl)

      // 更新任务为已完成
      updateTask({
        status: DOWNLOAD_STATUS.COMPLETED,
        isComplate: true,
        progress: 100,
        downloaded: receivedLength,
        total: contentLength > 0 ? contentLength : receivedLength,
        speed: '',
      })

      // 触发浏览器下载
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      if (err instanceof DOMException && err.name == 'AbortError') {
        // 用户取消
        updateTask({ status: DOWNLOAD_STATUS.WAITING, statusText: '', speed: '' })
        return
      }
      console.error('Browser download failed:', err)
      const message = err instanceof Error ? err.message : String(err)
      failDownloadProgress(message)
      showNotify(i18n.t('download.browser.download_failed', { name: info.musicInfo.name }))

      // 更新任务为失败
      updateTask({ status: DOWNLOAD_STATUS.ERROR, statusText: message, speed: '' })
    }
  }
}
