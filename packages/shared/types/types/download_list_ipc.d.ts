declare namespace AnyListen {
  namespace IPCDownload {
    /**
     * 待下载的歌曲。quality 由调用方（音质选择弹窗）选定。
     */
    interface AddMusicInfo {
      musicInfo: Music.MusicInfoOnline
      quality: string
    }

    /**
     * 保存目录状态。路径是下载器真正会用到的那个（含未配置时的回落目录），
     * exists 是它当前在本机是否存在且可写，前端拿它决定要不要提示用户重设。
     */
    interface SavePathStatus {
      savePath: string
      exists: boolean
    }

    type ActionList =
      | IPCAction<'add_music', AddMusicInfo[]>
      | IPCAction<'remove', string[]>
      | IPCAction<'retry', string[]>
      | IPCAction<'cancel', string[]>
      | IPCAction<'clear'>

    /**
     * 任务状态变化事件。action 复用 Download.DownloadTaskActions，
     * 前端只关心 progress / complete / error 这几种。
     */
    interface TaskEvent {
      id: string
      action: Download.DownloadTaskActions
      /**
       * 歌曲名 + 歌手，前端拼进度通知的文案用。
       */
      display: {
        name: string
        singer: string
      }
    }

    type ServerActions = WarpPromiseRecord<{
      getDownloadList: () => Download.ListItem[]
      downloadAction: (action: ActionList) => void
      getSavePathStatus: () => SavePathStatus
    }>
    type ServerIPCActions<Socket = undefined> = IPC.WarpIPCHandlerActions<Socket, ServerActions>

    type ClientActions = WarpPromiseRecord<{
      downloadEvent: (event: TaskEvent) => void
      /**
       * 任务增删（加入 / 删除 / 清空）。进度走 downloadEvent 单条更新，整表变化走这里。
       */
      downloadListChanged: () => void
    }>
    type ClientIPCActions<Socket = undefined> = IPC.WarpIPCHandlerActions<Socket, ClientActions>
  }
}
