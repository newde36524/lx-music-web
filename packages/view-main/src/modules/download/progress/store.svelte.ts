/**
 * 下载进度状态管理。
 * Web 版下载时显示环形进度条，下载完成后触发文件保存。
 */

type DownloadStatus = 'preparing' | 'downloading' | 'completed' | 'error'

interface DownloadProgressState {
  visible: boolean
  status: DownloadStatus
  progress: number
  speed: string
  fileName: string
  errorMessage: string
  abortController: AbortController | null
  blobUrl: string
}

export const downloadProgressState = $state<DownloadProgressState>({
  visible: false,
  status: 'preparing',
  progress: 0,
  speed: '',
  fileName: '',
  errorMessage: '',
  abortController: null,
  blobUrl: '',
})

/**
 * 开始下载进度（准备中）。
 */
export const startDownloadProgress = (fileName: string, abortController: AbortController) => {
  downloadProgressState.visible = true
  downloadProgressState.status = 'preparing'
  downloadProgressState.progress = 0
  downloadProgressState.speed = ''
  downloadProgressState.fileName = fileName
  downloadProgressState.errorMessage = ''
  downloadProgressState.abortController = abortController
  downloadProgressState.blobUrl = ''
}

/**
 * 开始下载。
 */
export const beginDownloading = () => {
  if (downloadProgressState.visible) {
    downloadProgressState.status = 'downloading'
  }
}

/**
 * 更新下载进度。
 */
export const updateDownloadProgress = (progress: number, speed: string) => {
  if (downloadProgressState.visible && downloadProgressState.status == 'downloading') {
    downloadProgressState.progress = progress
    downloadProgressState.speed = speed
  }
}

/**
 * 完成下载，显示完成状态。
 */
export const completeDownloadProgress = (blobUrl: string) => {
  if (downloadProgressState.visible) {
    downloadProgressState.status = 'completed'
    downloadProgressState.progress = 100
    downloadProgressState.speed = ''
    downloadProgressState.blobUrl = blobUrl
  }
}

/**
 * 下载失败。
 */
export const failDownloadProgress = (errorMessage: string) => {
  if (downloadProgressState.visible) {
    downloadProgressState.status = 'error'
    downloadProgressState.errorMessage = errorMessage
  }
}

/**
 * 关闭进度弹框。
 */
export const closeDownloadProgress = () => {
  if (downloadProgressState.blobUrl) {
    URL.revokeObjectURL(downloadProgressState.blobUrl)
  }
  downloadProgressState.visible = false
  downloadProgressState.abortController = null
  downloadProgressState.blobUrl = ''
}

/**
 * 取消下载。
 */
export const cancelDownloadProgress = () => {
  downloadProgressState.abortController?.abort()
  if (downloadProgressState.blobUrl) {
    URL.revokeObjectURL(downloadProgressState.blobUrl)
  }
  downloadProgressState.visible = false
  downloadProgressState.abortController = null
  downloadProgressState.blobUrl = ''
}
