import { readable } from 'svelte/store'

import { playDetailEvent } from './store/event'
import { playDetailState } from './store/state'

export const isShowPlayDetail = readable(playDetailState.isShowPlayDetail, (set) => {
  return playDetailEvent.on('visible', set)
})

// 纯歌词模式：点击封面进入（隐藏封面/歌曲信息，只显示歌词），点击歌词退出。
// 用模块级 $state（对象形式），跨模块改 .value 会走代理 setter，保证各处都响应。
export const playDetailLyricsMode = $state({ value: false })

// 纯歌词模式下正在做「左右滑切回封面」的横向手势。
// 置 true 期间歌词自身的拖动/滚动（useLyric）应忽略，避免横滑时误触歌词滚动。
// 同样用对象形式保证跨模块响应。
export const lyricHorizontalSwipe = $state({ value: false })
