import { onVisibilityChange } from '@any-listen/web'

import { onRelease } from '@/modules/app/shared'
import { playerEvent } from '@/modules/player/store/event'
import { playerState } from '@/modules/player/store/state'
import { settingEvent } from '@/modules/setting/store/event'
import { settingState } from '@/modules/setting/store/state'
import { getCurrentTime as getPlayerCurrentTime } from '@/plugins/player'
import { createUnsubscriptionSet } from '@/shared'

// import * as desktopLyric from './desktopLyric'
import * as lyric from './lyric'
import { initMacStatusBarLyric } from './macStatusBarLyric'
import { setOffset } from './store/action'
import { initTitleLyric } from './titleLyric'

const getCurrentTime = () => {
  return getPlayerCurrentTime() * 1000
}

const play = () => {
  // if (!musicInfo.lrc) return
  const currentTime = getCurrentTime()
  lyric.play(currentTime)
}
const pause = () => {
  lyric.pause()
}

const stop = () => {
  lyric.stop()
}

/**
 * 拖动进度条时实时同步歌词到指定时间（毫秒）。
 * 用 setTime 只做一次性定位（不推进），避免拖动过程中歌词继续走。
 */
const setLyricTime = (time: number) => {
  if (!playerState.musicInfo.id) return
  lyric.setTime(time)
}

/**
 * seek 到指定时间（秒）后重同步歌词：播放中则继续推进，否则只定位。
 */
const setLyricProgress = (time: number) => {
  if (!playerState.musicInfo.id) return
  if (playerState.playerPlaying) {
    lyric.play(time * 1000)
  } else {
    lyric.setTime(time * 1000)
  }
}

const setLyricOffset = (offset: number) => {
  lyric.setOffset(offset)
  setOffset(offset)
  playerEvent.lyricOffsetUpdated(offset)
  // console.log('setLyricOffset', offset)
  if (playerState.playerPlaying) setTimeout(play)
}

const setPlaybackRate = (rate: number) => {
  lyric.setPlaybackRate(rate)

  if (playerState.playerPlaying) setTimeout(play)
}

const setLyric = () => {
  if (!playerState.musicInfo.id) return
  if (playerState.musicInfo.lrc) {
    const extendedLyrics = []
    if (settingState.setting['player.isShowLyricRoma'] && playerState.musicInfo.rlrc) {
      extendedLyrics.push(playerState.musicInfo.rlrc)
    }
    if (settingState.setting['player.isShowLyricTranslation'] && playerState.musicInfo.tlrc) {
      extendedLyrics.push(playerState.musicInfo.tlrc)
    }
    if (settingState.setting['player.isSwapLyricTranslationAndRoma']) {
      extendedLyrics.reverse()
    }
    lyric.setLyric(
      settingState.setting['player.isPlayAwlrc'] && playerState.musicInfo.awlrc
        ? playerState.musicInfo.awlrc
        : playerState.musicInfo.lrc,
      extendedLyrics
    )
  }

  if (playerState.playerPlaying) setTimeout(play)
}
const watchSettings = [
  'player.isShowLyricTranslation',
  'player.isShowLyricRoma',
  'player.isSwapLyricTranslationAndRoma',
  'player.isPlayAwlrc',
] satisfies Array<keyof AnyListen.AppSetting>

const unregistered = createUnsubscriptionSet()
export const initLyric = () => {
  onRelease(() => {
    stop()
    unregistered.clear()
  })
  settingEvent.on('inited', () => {
    unregistered.register((subscriptions) => {
      subscriptions.add(lyric.initLyric())
      if (import.meta.env.VITE_IS_MAC) subscriptions.add(initMacStatusBarLyric()) // 需在 initTitleLyric 之前初始化
      subscriptions.add(initTitleLyric())
      subscriptions.add(playerEvent.on('lyricUpdated', setLyric))
      subscriptions.add(playerEvent.on('setLyricOffset', setLyricOffset))
      subscriptions.add(playerEvent.on('setPlaybackRate', setPlaybackRate))
      subscriptions.add(
        settingEvent.on('updated', (keys) => {
          if (watchSettings.some((k) => keys.includes(k))) setLyric()
        })
      )
      subscriptions.add(playerEvent.on('musicChanged', stop))
      subscriptions.add(playerEvent.on('play', play))
      subscriptions.add(playerEvent.on('pause', pause))
      subscriptions.add(playerEvent.on('stop', stop))
      subscriptions.add(playerEvent.on('error', pause))
      subscriptions.add(playerEvent.on('setLyricTime', setLyricTime))
      subscriptions.add(playerEvent.on('setProgress', setLyricProgress))
      // 从其他页面/App 切回来时，若仍在播放，把歌词重新同步到音频当前进度，
      // 避免后台期间（JS 定时器被冻结）歌词与音频脱节
      subscriptions.add(
        onVisibilityChange((hidden) => {
          if (hidden) return
          if (playerState.playerPlaying) setTimeout(play)
        })
      )
    })
  })
}
