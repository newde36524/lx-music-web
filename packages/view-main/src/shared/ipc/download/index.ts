import { ipc } from '../ipc'

export const getDownloadList: AnyListen.IPC.ServerIPC['getDownloadList'] = async () => {
  return ipc.getDownloadList()
}

export const sendDownloadAction: AnyListen.IPC.ServerIPC['downloadAction'] = async (action) => {
  return ipc.downloadAction(action)
}

export const getSavePathStatus: AnyListen.IPC.ServerIPC['getSavePathStatus'] = async () => {
  return ipc.getSavePathStatus()
}

export const getEmbedData: AnyListen.IPC.ServerIPC['getEmbedData'] = async (musicInfo) => {
  return ipc.getEmbedData(musicInfo)
}
