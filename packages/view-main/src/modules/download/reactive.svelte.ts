import { DOWNLOAD_STATUS } from '@any-listen/common/constants'

import { downloadListEvent, downloadListState } from './store/state'

/**
 * 取任务列表快照，之后跟着列表变化更新。
 * state 里每次变化都换一个新数组引用，所以这里直接替换 val 就能让视图重新渲染。
 */
const useDownloadListSnap = () => {
  let val = $state.raw(downloadListState.list)

  $effect(() => {
    const unsub = downloadListEvent.on(() => {
      val = downloadListState.list
    })
    return unsub
  })

  return {
    get val() {
      return val
    },
  }
}

export const useDownloadList = useDownloadListSnap

/** 列表是否已经拉过一次，用来区分「没任务」和「还没加载」 */
export const useDownloadListInited = () => {
  let val = $state(downloadListState.inited)
  $effect(() => {
    const unsub = downloadListEvent.on(() => {
      val = downloadListState.inited
    })
    return unsub
  })
  return {
    get val() {
      return val
    },
  }
}

/** 排队中 + 进行中的任务数，侧边栏角标用 */
export const useDownloadTaskCount = () => {
  const list = useDownloadListSnap()
  let val = $derived.by(
    () =>
      list.val.filter((task) => task.status == DOWNLOAD_STATUS.RUN || task.status == DOWNLOAD_STATUS.WAITING).length
  )
  return {
    get val() {
      return val
    },
  }
}

/** 已完成的任务数，下载页「清空已完成」按钮用 */
export const useDownloadCompletedCount = () => {
  const list = useDownloadListSnap()
  let val = $derived.by(() => list.val.filter((task) => task.status == DOWNLOAD_STATUS.COMPLETED).length)
  return {
    get val() {
      return val
    },
  }
}
