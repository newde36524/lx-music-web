import { downloadCoverImage, isSupportedAudioFile, writeFileTags } from '@any-listen/nodejs'

import { getMusicLyric } from '../resources/lyric'

import type { DownloadConfig } from './index'

/**
 * 下载完成后嵌入封面和歌词到音频文件。
 * 支持 MP3、FLAC、M4A 等格式。
 * 失败时仅记录警告，不影响下载完成状态。
 */
export const embedDownloadMetadata = async (task: AnyListen.Download.ListItem, config: DownloadConfig): Promise<void> => {
  if (!config.embedMetadata) return

  const filePath = task.metadata.filePath
  const ext = task.metadata.ext
  if (!filePath) return

  try {
    const supported = await isSupportedAudioFile(filePath, ext)
    if (!supported) return

    const musicInfo = task.metadata.musicInfo
    const [picBuffer, lyricInfo] = await Promise.all([
      musicInfo.meta.picUrl ? downloadCoverImage(musicInfo.meta.picUrl) : Promise.resolve(null),
      getMusicLyric({ musicInfo }).catch(() => null),
    ])

    await writeFileTags(filePath, {
      title: musicInfo.name,
      artist: musicInfo.singer,
      album: musicInfo.meta.albumName ?? '',
      year: musicInfo.meta.year,
      trackNo: musicInfo.meta.trackNo,
      discNo: musicInfo.meta.discNo,
      picture: picBuffer,
      lyric: lyricInfo?.lyric ?? null,
    })
  } catch (err) {
    console.warn(`[EmbedMeta] failed for ${task.metadata.fileName}:`, err)
  }
}
