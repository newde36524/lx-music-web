import { downloadEventIPC, downloadListChangedIPC } from './event'

export default {
  async downloadEvent(event) {
    downloadEventIPC.emit(event)
  },
  async downloadListChanged() {
    downloadListChangedIPC.emit()
  },
} satisfies Partial<AnyListen.IPC.ClientIPC>
