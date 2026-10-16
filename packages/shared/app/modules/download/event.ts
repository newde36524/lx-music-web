import _Event, { type EventType } from '@any-listen/nodejs/Event'

/**
 * 下载事件总线。这里只做信号转发，下载逻辑在 ./index.ts。
 * list_changed   —— 任务增删，前端重新拉取列表
 * task_updated   —— 单个任务状态变化（进度 / 完成 / 出错），前端更新对应通知
 */
class Event extends _Event {
  emitEvent<K extends keyof EventMethods>(eventName: K, ...args: unknown[]) {
    this.emit(eventName, ...args)
  }

  list_changed() {
    this.emit('list_changed')
  }

  task_updated(task: AnyListen.Download.ListItem, action: AnyListen.Download.DownloadTaskActions) {
    this.emit('task_updated', task, action)
  }
}

type EventMethods = Omit<Event, keyof _Event | 'emitEvent'>

export const downloadEvent = new Event() as EventType<Event>
