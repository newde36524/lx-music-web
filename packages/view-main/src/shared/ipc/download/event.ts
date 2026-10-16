import SingleEvent from '@any-listen/web/SimpleSingleEvent'

/** 单个任务的状态变化（进度 / 完成 / 出错），单条更新通知 */
export const downloadEventIPC = new SingleEvent<[event: AnyListen.IPCDownload.TaskEvent]>()

/** 任务增删（加入 / 删除 / 清空），列表页整表刷新 */
export const downloadListChangedIPC = new SingleEvent<[]>()
