import { getDownloadList, getEmbedData, getSavePathStatus, sendDownloadAction } from '@any-listen/app/modules/download'

import type { ExposeFunctions } from '.'

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
  } satisfies Partial<ExposeFunctions>
}
