import type { IPCSocket } from '@/preload/ws'

import type { ClientCall, ExposeFunctions } from '.'

// 暴露给后端的方法
export const createExposeDownload = (client: ClientCall) => {
  return {
    async downloadEvent(socket: IPCSocket, event: AnyListen.IPCDownload.TaskEvent) {
      return client.downloadEvent(event)
    },
    async downloadListChanged(socket: IPCSocket) {
      return client.downloadListChanged()
    },
  } satisfies Partial<ExposeFunctions>
}

// 暴露给前端的方法
export const createClientDownload = (ipcSocket: IPCSocket) => {
  return {
    async getDownloadList() {
      return ipcSocket.remoteQueueDownload.getDownloadList()
    },
    async getSavePathStatus() {
      return ipcSocket.remoteQueueDownload.getSavePathStatus()
    },
    async downloadAction(action) {
      return ipcSocket.remoteQueueDownload.downloadAction(action)
    },
  } satisfies Partial<AnyListen.IPC.ServerIPC>
}
