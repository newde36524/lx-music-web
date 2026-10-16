import SingleEvent from '@any-listen/web/SimpleSingleEvent'

export interface DownloadListState {
  /** 后端返回的任务列表 */
  list: AnyListen.Download.ListItem[]
  /** 是否已经拉过至少一次，用来区分「列表为空」和「还没加载」 */
  inited: boolean
}

export const downloadListState: DownloadListState = {
  list: [],
  inited: false,
}

/**
 * 任务列表变化。进度是单条 patch，增删 / 重下排队是整表变化，
 * 两者最后都走这里通知视图刷新，视图不用区分来源。
 */
export const downloadListEvent = new SingleEvent<[]>()
