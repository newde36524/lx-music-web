import type { ClientCall, ExposeFunctions, MainCall } from '.'

// 暴露给后端的方法
export const createExposeDownload = (client: ClientCall) => {
  return {
    async downloadEvent(event, taskEvent) {
      return client.downloadEvent(taskEvent)
    },
    async downloadListChanged(event) {
      return client.downloadListChanged()
    },
  } satisfies Partial<ExposeFunctions>
}

// 暴露给前端的方法
export const createClientDownload = (main: MainCall) => {
  return {
    async getDownloadList() {
      return main.getDownloadList()
    },
    async getSavePathStatus() {
      return main.getSavePathStatus()
    },
    async downloadAction(action) {
      return main.downloadAction(action)
    },
  } satisfies Partial<AnyListen.IPC.ServerIPC>
}
