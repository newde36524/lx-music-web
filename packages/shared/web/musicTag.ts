/**
 * 浏览器端音频元数据写入工具。
 * - MP3: 使用 browser-id3-writer
 * - FLAC: 纯 JS 实现 (Vorbis Comment + Picture)，无原生依赖
 *
 * 所有函数在 Blob 级别操作，不依赖 Node.js Buffer。
 */
import { ID3Writer } from 'browser-id3-writer'

export interface BrowserFileTags {
  title: string
  artist: string
  album: string
  year?: number
  trackNo?: number | null
  discNo?: number | null
  picture?: Uint8Array | null
  lyric?: string | null
}

// ─── Utilities ───────────────────────────────────────────────────────────────

const utf8Encode = (str: string): Uint8Array => new TextEncoder().encode(str)

const readUint32BE = (data: Uint8Array, offset: number): number => {
  return (
    ((data[offset] & 0xff) << 24) |
    ((data[offset + 1] & 0xff) << 16) |
    ((data[offset + 2] & 0xff) << 8) |
    (data[offset + 3] & 0xff)
  )
}

const readUint16BE = (data: Uint8Array, offset: number): number => {
  return data[offset] * 0x100 + data[offset + 1]
}

const writeUint32BE = (data: Uint8Array, value: number, offset: number): void => {
  data[offset] = (value >> 24) & 0xff
  data[offset + 1] = (value >> 16) & 0xff
  data[offset + 2] = (value >> 8) & 0xff
  data[offset + 3] = value & 0xff
}

const concat = (...arrays: Uint8Array[]): Uint8Array => {
  let total = 0
  for (const a of arrays) total += a.length
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

const latin1ToString = (data: Uint8Array, start: number, end: number): string => {
  let str = ''
  for (let i = start; i < end; i++) str += String.fromCharCode(data[i])
  return str
}

/**
 * 从原始图片字节检测 MIME 类型和像素尺寸。
 * JPEG: 查找 SOF0 标记 (FF C0)，尺寸在标记后偏移 5/7 处。
 * PNG: 尺寸固定在 IHDR chunk 中偏移 16/20 处。
 */
const detectImageInfo = (data: Uint8Array): { mime: string; width: number; height: number; bpp: number } => {
  // JPEG: FF D8 FF ...
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    let width = 0, height = 0
    for (let i = 2; i < data.length - 7; i++) {
      if (data[i] === 0xff) {
        const marker = data[i + 1]
        // SOF 标记: 0xC0-0xCF (排除 DHT=0xC4, JPG=0xC8, DAC=0xCC)
        if (
          marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
        ) {
          height = readUint16BE(data, i + 5)
          width = readUint16BE(data, i + 7)
          break
        }
      }
    }
    return { mime: 'image/jpeg', width, height, bpp: 24 }
  }
  // PNG: 89 50 4E 47 ...
  if (data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    const width = readUint32BE(data, 16)
    const height = readUint32BE(data, 20)
    return { mime: 'image/png', width, height, bpp: 32 }
  }
  return { mime: 'image/jpeg', width: 0, height: 0, bpp: 24 }
}

// ─── FLAC ────────────────────────────────────────────────────────────────────

const buildFlacMetadataBlock = (type: number, data: Uint8Array): Uint8Array => {
  const header = new Uint8Array(4)
  header[0] = type & 0x7f
  header[1] = (data.length >> 16) & 0xff
  header[2] = (data.length >> 8) & 0xff
  header[3] = data.length & 0xff
  return concat(header, data)
}

// Vorbis Comment 块遵循 Vorbis 规范，长度字段用小端序（主机字节序）
const writeUint32LE = (data: Uint8Array, value: number, offset: number): void => {
  data[offset] = value & 0xff
  data[offset + 1] = (value >> 8) & 0xff
  data[offset + 2] = (value >> 16) & 0xff
  data[offset + 3] = (value >> 24) & 0xff
}

const writeFlacVorbisComment = (tags: BrowserFileTags, lyric: string | null): Uint8Array => {
  const comments: string[] = []
  if (tags.title) comments.push(`TITLE=${tags.title}`)
  if (tags.artist) comments.push(`ARTIST=${tags.artist}`)
  if (tags.album) comments.push(`ALBUM=${tags.album}`)
  if (tags.year && tags.year > 0) comments.push(`DATE=${tags.year}`)
  if (tags.trackNo && tags.trackNo > 0) comments.push(`TRACKNUMBER=${tags.trackNo}`)
  if (tags.discNo && tags.discNo > 0) comments.push(`DISCNUMBER=${tags.discNo}`)
  if (lyric && lyric.trim().length > 0) comments.push(`LYRICS=${lyric}`)

  const commentData = concat(
    ...comments.map((c) => {
      const buf = utf8Encode(c)
      const len = new Uint8Array(4)
      writeUint32LE(len, buf.length, 0)
      return concat(len, buf)
    })
  )

  // 使用与 libFLAC / LX Music 一致的 vendor 字符串，部分播放器依赖它识别 Vorbis 块
  const vendor = 'reference libFLAC 1.2.1 20070917'
  const vendorBytes = utf8Encode(vendor)
  const vendorLen = new Uint8Array(4)
  writeUint32LE(vendorLen, vendorBytes.length, 0)
  const numComments = new Uint8Array(4)
  writeUint32LE(numComments, comments.length, 0)

  // lx-music 使用 type=4 表示 VORBIS_COMMENT（非标准编号，播放器兼容）
  return buildFlacMetadataBlock(4, concat(vendorLen, vendorBytes, numComments, commentData))
}

const writeFlacPicture = (picture: Uint8Array): Uint8Array => {
  // 从图片字节检测 MIME 类型和实际尺寸（与 LX Music 一致）
  const { mime, width, height, bpp } = detectImageInfo(picture)
  const description = ''
  const mimeBytes = utf8Encode(mime)
  const descBytes = utf8Encode(description)

  // lx-music Picture 块字段 (big-endian, 非标准字段顺序):
  // picture_type(4) + mime_len(4) + mime + desc_len(4) + desc +
  // width(4) + height(4) + bpp(4) + colors(4) + data_len(4) + data
  const data = new Uint8Array(32 + mimeBytes.length + descBytes.length + picture.length)
  let offset = 0

  writeUint32BE(data, 3, offset); offset += 4 // picture type: 3 = front cover
  writeUint32BE(data, mimeBytes.length, offset); offset += 4
  data.set(mimeBytes, offset); offset += mimeBytes.length
  writeUint32BE(data, descBytes.length, offset); offset += 4
  data.set(descBytes, offset); offset += descBytes.length
  writeUint32BE(data, width, offset); offset += 4
  writeUint32BE(data, height, offset); offset += 4
  writeUint32BE(data, bpp, offset); offset += 4
  writeUint32BE(data, 0, offset); offset += 4 // colors
  writeUint32BE(data, picture.length, offset); offset += 4
  data.set(picture, offset)

  // lx-music 使用 type=6 表示 PICTURE（非标准编号，播放器兼容）
  return buildFlacMetadataBlock(6, data)
}

const writeFlacTags = (fileData: Uint8Array, tags: BrowserFileTags): Uint8Array => {
  if (latin1ToString(fileData, 0, 4) !== 'fLaC') return fileData

  let offset = 4
  let metadataEnd = 4
  let hasVorbisComment = false
  let foundLast = false

  while (offset + 4 <= fileData.length) {
    const header = readUint32BE(fileData, offset)
    // byte0 = bits 31-24: bit31=LAST, bits 30-24=TYPE
    // bytes 1-3 = bits 23-0: LENGTH
    const isLast = (header & 0x80000000) !== 0
    const type = (header >>> 24) & 0x7f  // >>> 无符号右移，避免 LAST 标志影响 type
    const length = header & 0x00ffffff

    if (type === 4) hasVorbisComment = true

    offset += 4 + length

    if (isLast) {
      metadataEnd = offset
      foundLast = true
      break
    }
  }

  // 部分 FLAC 文件缺少 LAST 标志位，回退到逐块校验：
  // FLAC 音频帧以 0x7F 开头（14-bit 同步码 0x7FFF 的高字节），遇到即停止
  if (!foundLast) {
    let scanOffset = 4
    let scanCount = 0
    while (scanOffset + 4 <= fileData.length) {
      // 音频帧同步字节检查
      if (fileData[scanOffset] === 0x7f) break
      const header = readUint32BE(fileData, scanOffset)
      const type = (header >>> 24) & 0x7f
      const length = header & 0x00ffffff
      // STREAMINFO 固定 34 字节，PADDING 通常 192-8192 字节，其他块 ≤ 1MB
      // lx-music 编号: 0=STREAMINFO, 1=PADDING, 3=SEEKTABLE
      const maxLen = type === 0 ? 34 : type === 1 ? 8192 : 1048576
      if (type > 126 || length > maxLen || scanOffset + 4 + length > fileData.length) break
      scanOffset += 4 + length
      scanCount++
    }
    metadataEnd = scanOffset
    console.log('[tag] fallback scan: found', scanCount, 'blocks, metadataEnd=', metadataEnd)
  } else {
    console.log('[tag] found LAST flag, metadataEnd=', metadataEnd)
  }

  const audioData = fileData.slice(metadataEnd)
  const newBlocks: Uint8Array[] = []

  let currentOffset = 4
  while (currentOffset < metadataEnd) {
    const header = readUint32BE(fileData, currentOffset)
    const isLast = (header & 0x80000000) !== 0
    const type = (header >>> 24) & 0x7f  // >>> 无符号右移
    const length = header & 0x00ffffff

    // lx-music 编号: 0=STREAMINFO, 1=PADDING, 2=APPLICATION, 3=SEEKTABLE, 4=VORBIS, 5=CUESHEET, 6=PICTURE
    const typeName = ['STREAMINFO', 'PADDING', 'APPLICATION', 'SEEKTABLE', 'VORBIS', 'CUESHEET', 'PICTURE'][type] ?? `UNKNOWN(${type})`
    console.log(`[tag] block at ${currentOffset}: type=${type} (${typeName}), len=${length}, last=${isLast}`)

    // 保留原始块（STREAMINFO/PADDING/APPLICATION/SEEKTABLE/CUESHEET），丢弃 vorbis(4) 和 picture(6)
    if (type === 0 || type === 1 || type === 2 || type === 3 || type === 5) {
      const block = fileData.slice(currentOffset, currentOffset + 4 + length)
      // 清除保留块的 last 标志，避免解码器在中间停止读取
      block[0] &= 0x7f
      newBlocks.push(block)
    }

    currentOffset += 4 + length
    if (isLast) break
  }

  console.log('[tag] kept blocks:', newBlocks.length, 'audioData starts at:', metadataEnd)

  // 嵌入模式下始终写入 Vorbis Comment 块，保证 LAST 标志有载体
  if (tags.title || tags.artist || tags.album || tags.lyric || !hasVorbisComment) {
    newBlocks.push(writeFlacVorbisComment(tags, tags.lyric ?? null))
    console.log('[tag] added vorbis block')
  }

  if (tags.picture && tags.picture.length > 0) {
    newBlocks.push(writeFlacPicture(tags.picture))
    console.log('[tag] added picture block')
  }

  // 确保 LAST 标志始终设置
  if (newBlocks.length > 0) {
    const lastBlock = newBlocks[newBlocks.length - 1]
    if (lastBlock) lastBlock[0] |= 0x80
    console.log('[tag] LAST flag set on block', newBlocks.length - 1, 'byte0=', lastBlock?.[0]?.toString(16))
  }

  const magic = new Uint8Array(4)
  magic.set(utf8Encode('fLaC'))

  // 不用 ...newBlocks 展开（可能数千块导致参数溢出），手动拼接
  let total = 4 + audioData.length
  for (const block of newBlocks) total += block.length
  const result = new Uint8Array(total)
  let off = 0
  result.set(magic, off); off += 4
  for (const block of newBlocks) { result.set(block, off); off += block.length }
  result.set(audioData, off)
  return result
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * 创建带元数据的 Blob。
 * - MP3: 使用 browser-id3-writer
 * - FLAC: 使用纯 JS FLAC 写入器
 * - 其他格式: 原样返回
 */
export const createTaggedBlob = async (chunks: Uint8Array[], ext: string, tags: BrowserFileTags): Promise<Blob> => {
  // chunks 可能有数千片（流式下载），spread 会超出 max call stack，手动拼接
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const fileData = new Uint8Array(totalLength)
  let writeOffset = 0
  for (const chunk of chunks) {
    fileData.set(chunk, writeOffset)
    writeOffset += chunk.length
  }
  const lowerExt = ext.toLowerCase()

  if (lowerExt === 'flac') {
    console.log('[tag] writeFlacTags start, input size:', fileData.length)
    const tagged = writeFlacTags(fileData, tags)
    console.log('[tag] writeFlacTags done, output size:', tagged.length)
    return new Blob([tagged])
  }

  if (lowerExt === 'mp3') {
    const buffer = fileData.buffer as ArrayBuffer
    const writer = new ID3Writer(buffer)

    if (tags.title) writer.setFrame('TIT2', tags.title)
    if (tags.artist) writer.setFrame('TPE1', [tags.artist])
    if (tags.album) writer.setFrame('TALB', tags.album)
    if (tags.year && tags.year > 0) writer.setFrame('TYER', tags.year)
    if (tags.trackNo && tags.trackNo > 0) writer.setFrame('TRCK', String(tags.trackNo))
    if (tags.discNo && tags.discNo > 0) writer.setFrame('TPOS', String(tags.discNo))

    if (tags.picture && tags.picture.length > 0) {
      writer.setFrame('APIC', {
        type: 3,
        data: tags.picture,
        description: 'Cover',
      })
    }

    if (tags.lyric && tags.lyric.trim().length > 0) {
      writer.setFrame('USLT', {
        language: 'chi',
        description: 'Lyrics',
        lyrics: tags.lyric,
      })
    }

    writer.addTag()
    return writer.getBlob()
  }

  // 不支持的格式，原样返回
  return new Blob(chunks as BlobPart[])
}
