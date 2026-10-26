import {
  getDownloadList,
  getEmbedData,
  getSavePathStatus,
  onDownloadEvent,
  onDownloadListChanged,
  sendDownloadAction,
} from '@any-listen/app/modules/download'

import { broadcast } from '@/modules/ipc/websocket'

import type { ExposeClientFunctions, ExposeServerFunctions } from '.'

// 暴露给前端的方法
export const createExposeDownload = () => {
  return {
    async getDownloadList() {
      return getDownloadList()
    },
    async getSavePathStatus() {
      return getSavePathStatus()
    },
    async downloadAction(event, action) {
      return sendDownloadAction(action)
    },
    async getEmbedData(event, musicInfo: AnyListen.Music.MusicInfoOnline) {
      return getEmbedData(musicInfo)
    },
  } satisfies Partial<ExposeClientFunctions>
}

// 暴露给后端的方法：把下载进度 / 完成 / 出错推给所有主窗口
export const createServerDownload = () => {
  const actions = {
    async downloadEvent(event: AnyListen.IPCDownload.TaskEvent) {
      broadcast((socket) => {
        if (socket.winType != 'main' || !socket.isInited) return
        void socket.remoteQueueDownload.downloadEvent(event)
      })
    },
    // 任务增删，通知列表页整表刷新
    async downloadListChanged() {
      broadcast((socket) => {
        if (socket.winType != 'main' || !socket.isInited) return
        void socket.remoteQueueDownload.downloadListChanged()
      })
    },
  } satisfies Partial<ExposeServerFunctions>

  // eslint-disable-next-line @typescript-eslint/unbound-method
  onDownloadEvent(actions.downloadEvent)
  onDownloadListChanged(() => void actions.downloadListChanged())

  return actions
}
