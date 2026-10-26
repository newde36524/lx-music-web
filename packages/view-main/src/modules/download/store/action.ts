import { DOWNLOAD_STATUS } from '@any-listen/common/constants'

import { onConnected } from '../../app/shared'
import { getDownloadList, sendDownloadAction } from '@/shared/ipc/download'
import { downloadEventIPC, downloadListChangedIPC } from '@/shared/ipc/download/event'

import {
  browserTaskListChanged,
  browserTaskUpdated,
  cancelBrowserDownload,
  clearBrowserDownloadCompleted,
  initBrowserDownload,
  isBrowserTaskId,
  listBrowserTasks,
  removeBrowserDownload,
  retryBrowserDownload,
  type BrowserTaskPatch,
} from '../browser'

import { downloadListEvent, downloadListState } from './state'

let inited = false

/** 单条 patch：任务不在本地列表里就忽略，等下一次整表刷新补上 */
const patchTask = (id: string, patch: BrowserTaskPatch) => {
  const list = downloadListState.list
  const index = list.findIndex((task) => task.id == id)
  if (index < 0) return
  const task = list[index]
  if (!task) return
  list[index] = { ...task, ...patch, metadata: { ...task.metadata, ...patch.metadata } }
  downloadListState.list = [...list]
}

/**
 * 两条引擎的任务合成一张表。同一个 id 在两种模式下是同一个值，
 * 撞到时以前端内存里的浏览器任务为准，它才是用户这次实际在跑的那份。
 */
const mergeTasks = (serverTasks: AnyListen.Download.ListItem[]): AnyListen.Download.ListItem[] => {
  const browserTasks = listBrowserTasks()
  const merged = new Map<string, AnyListen.Download.ListItem>()
  for (const task of serverTasks) merged.set(task.id, { ...task, metadata: { ...task.metadata } })
  for (const task of browserTasks) merged.set(task.id, { ...task, metadata: { ...task.metadata } })
  return [...merged.values()]
}

const handleEvent = (event: AnyListen.IPCDownload.TaskEvent) => {
  const { action } = event
  switch (action.action) {
    case 'start':
      patchTask(event.id, { status: DOWNLOAD_STATUS.RUN })
      break
    case 'progress':
      patchTask(event.id, {
        progress: action.data.progress,
        speed: action.data.speed,
        downloaded: action.data.downloaded,
        total: action.data.total,
        writeQueue: action.data.writeQueue,
      })
      break
    case 'complete':
      patchTask(event.id, {
        status: DOWNLOAD_STATUS.COMPLETED,
        isComplate: true,
        progress: 100,
        speed: '',
      })
      break
    case 'error':
      patchTask(event.id, { status: DOWNLOAD_STATUS.ERROR, speed: '', statusText: action.data.message ?? '' })
      break
    case 'statusText':
      patchTask(event.id, { statusText: action.data })
      break
    default:
      // refreshUrl 后端不改持久化字段，这里不动列表
      break
  }
  downloadListEvent.emit()
}

const splitIds = (ids: string[]) => {
  const browserIds: string[] = []
  const serverIds: string[] = []
  for (const id of ids) {
    if (isBrowserTaskId(id)) browserIds.push(id)
    else serverIds.push(id)
  }
  return { browserIds, serverIds }
}

/**
 * 订阅下载事件并拉一次列表。在 main.ts 里调一次。
 * 服务端任务走 IPC，浏览器任务走本地事件，两条都在这里汇到 downloadListState。
 */
export const initDownloadList = async () => {
  if (inited) return
  inited = true
  await initBrowserDownload()
  downloadEventIPC.on(handleEvent)
  downloadListChangedIPC.on(() => {
    void refreshDownloadList()
  })
  browserTaskListChanged.on(() => {
    void refreshDownloadList()
  })
  browserTaskUpdated.on((id, patch) => {
    patchTask(id, patch)
    downloadListEvent.emit()
  })
  // IPC 连上之后再拉第一次列表：连上之前调 ipc 会直接抛错，而且后面没有任何东西会补拉
  onConnected(() => {
    void refreshDownloadList()
  })
}

export const refreshDownloadList = async () => {
  try {
    downloadListState.list = mergeTasks(await getDownloadList())
  } catch (err) {
    // 取不到服务端列表时别把浏览器任务也一起清了
    downloadListState.list = mergeTasks([])
    console.error('Get download list failed:', err)
  }
  downloadListState.inited = true
  downloadListEvent.emit()
}

/**
 * 重下。失败 / 取消的任务断点续传，已完成的任务会当成全新一次下、文件自动追加序号。
 */
export const retryDownload = (ids: string[]) => {
  if (!ids.length) return
  const { browserIds, serverIds } = splitIds(ids)
  if (browserIds.length) void retryBrowserDownload(browserIds)
  if (serverIds.length) void sendDownloadAction({ action: 'retry', data: serverIds })
}

/** 取消排队中 / 进行中的任务，不删已写入的文件 */
export const cancelDownload = (ids: string[]) => {
  if (!ids.length) return
  const { browserIds, serverIds } = splitIds(ids)
  if (browserIds.length) void cancelBrowserDownload(browserIds)
  if (serverIds.length) void sendDownloadAction({ action: 'cancel', data: serverIds })
}

/**
 * 删除记录。进行中和失败的任务会连半成品文件一起清掉，
 * 已完成的那份文件是用户要留的成果，只删记录不动文件。
 */
export const removeDownload = (ids: string[]) => {
  if (!ids.length) return
  const { browserIds, serverIds } = splitIds(ids)
  if (browserIds.length) void removeBrowserDownload(browserIds)
  if (serverIds.length) void sendDownloadAction({ action: 'remove', data: serverIds })
}

/** 清掉所有已完成的任务记录，文件保留在硬盘上 */
export const clearCompletedDownload = async () => {
  const { browserIds, serverIds } = splitIds(
    downloadListState.list.filter((task) => task.status == DOWNLOAD_STATUS.COMPLETED).map((task) => task.id)
  )
  if (browserIds.length) await clearBrowserDownloadCompleted()
  if (serverIds.length) await sendDownloadAction({ action: 'remove', data: serverIds })
}

/** 取消所有排队中 / 进行中的任务 */
export const cancelAllDownload = async () => {
  const { browserIds, serverIds } = splitIds(
    downloadListState.list
      .filter((task) => task.status == DOWNLOAD_STATUS.WAITING || task.status == DOWNLOAD_STATUS.RUN)
      .map((task) => task.id)
  )
  if (browserIds.length) await cancelBrowserDownload(browserIds)
  if (serverIds.length) await sendDownloadAction({ action: 'cancel', data: serverIds })
}
