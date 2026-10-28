import { QUALITYS } from '@any-listen/common/constants'

import { settingState } from '@/modules/setting/store/state'

/** 音质从高到低排。QUALITYS 是升序，反一下就是最高音质在前。 */
export const QUALITYS_BEST_FIRST: AnyListen.Music.Quality[] = [...QUALITYS].reverse()

/** 无可用音质信息时的兜底音质 */
const FALLBACK_QUALITY: AnyListen.Music.Quality = '128k'

/**
 * 取当前歌曲可用的最高音质；拿不到可用音质信息时返回兜底音质 '128k'。
 * 本地歌曲没有 qualitys 字段（isLocal 为 true），按无信息处理。
 */
export const getBestQuality = (musicInfo: AnyListen.Music.MusicInfo): AnyListen.Music.Quality => {
  const qualitys = musicInfo.isLocal ? undefined : musicInfo.meta.qualitys
  if (qualitys) {
    return QUALITYS_BEST_FIRST.find((quality) => !!qualitys[quality]) ?? FALLBACK_QUALITY
  }
  return FALLBACK_QUALITY
}

/**
 * 计算播放实际使用的音质：
 * - 设置不是 'highest' 时直接用用户设置的音质；
 * - 设置为 'highest'（默认）时取当前歌曲可用的最高音质。
 */
export const getPlayQuality = (musicInfo: AnyListen.Music.MusicInfo): AnyListen.Music.Quality => {
  const playQuality = settingState.setting['player.playQuality']
  if (playQuality !== 'highest') return playQuality
  return getBestQuality(musicInfo)
}
