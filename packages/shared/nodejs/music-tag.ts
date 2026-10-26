import ID3 from 'node-id3'

import { writeFlacTags } from './flac-tag'
import { request } from './request'

export interface FileTags {
  title: string
  artist: string
  album: string
  year?: number
  trackNo?: number | null
  discNo?: number | null
  picture?: Buffer | null
  lyric?: string | null
}

/**
 * 检查文件是否真的是指定格式（防止 M4A 伪装成 MP3 等情况）。
 * 读取文件头几个字节判断格式。
 */
export const isSupportedAudioFile = async (filePath: string, ext: string): Promise<boolean> => {
  try {
    const fsPromises = await import('node:fs/promises')
    const fd = await fsPromises.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(4)
      await fd.read(buf, 0, 4, 0)

      switch (ext) {
        case 'mp3': {
          // ID3 tag: "ID3"
          if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true
          // MPEG sync word
          if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true
          return false
        }
        case 'flac':
          // FLAC: "fLaC"
          return buf.toString('latin1', 0, 4) === 'fLaC'
        default:
          return false
      }
    } finally {
      await fd.close()
    }
  } catch {
    return false
  }
}

/**
 * 从 URL 下载封面图片。
 * 使用 undici request 的 needRaw 模式获取原始字节。
 */
export const downloadCoverImage = async (picUrl: string): Promise<Buffer | null> => {
  try {
    const resp = await request(picUrl, { needRaw: true, timeout: 15_000 })
    if (!resp.raw || resp.raw.length === 0) return null
    return Buffer.from(resp.raw)
  } catch (err) {
    console.warn(`Failed to download cover image from ${picUrl}:`, (err as Error).message)
    return null
  }
}

/**
 * 将元数据标签写入音频文件。
 * MP3 使用 node-id3，FLAC 使用自定义 Vorbis Comment + Picture block 写入。
 */
export const writeFileTags = async (filePath: string, tags: FileTags): Promise<void> => {
  const ext = filePath.toLowerCase().split('.').pop()

  switch (ext) {
    case 'mp3':
      writeMp3Tags(filePath, tags)
      break
    case 'flac':
      await writeFlacTags(filePath, tags)
      break
    default:
      console.warn(`Unsupported format for metadata writing: ${ext}`)
  }
}

/**
 * 将元数据标签写入 MP3 文件。
 * 使用 node-id3 的 ID3v2 标签写入（同步操作）。
 */
const writeMp3Tags = (filePath: string, tags: FileTags): void => {
  const id3Tags: Record<string, unknown> = {}

  if (tags.title) id3Tags.title = tags.title
  if (tags.artist) id3Tags.artist = tags.artist
  if (tags.album) id3Tags.album = tags.album
  if (tags.year && tags.year > 0) id3Tags.year = String(tags.year)
  if (tags.trackNo && tags.trackNo > 0) id3Tags.track = { no: tags.trackNo }
  if (tags.discNo && tags.discNo > 0) id3Tags.disc = { no: tags.discNo }
  if (tags.picture && tags.picture.length > 0) {
    id3Tags.picture = { data: tags.picture, mime: 'image/jpeg' }
  }
  if (tags.lyric && tags.lyric.trim().length > 0) {
    id3Tags.USLT = [{ description: '', text: tags.lyric }]
  }

  if (Object.keys(id3Tags).length === 0) return

  ID3.write(id3Tags as any, filePath)
}
