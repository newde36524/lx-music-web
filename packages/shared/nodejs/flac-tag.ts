import type { FileTags } from './music-tag'

/**
 * Vorbis Comment block (type 3)
 * FLAC 元数据块结构：
 * - 1 bit: LAST_METADATA_BLOCK
 * - 7 bits: BLOCK_TYPE (3 = VORBIS_COMMENT)
 * - 24 bits: LENGTH (big-endian)
 */
const writeVorbisComment = (tags: FileTags, lyric: string | null): Buffer => {
  const comments: string[] = []
  if (tags.title) comments.push(`TITLE=${tags.title}`)
  if (tags.artist) comments.push(`ARTIST=${tags.artist}`)
  if (tags.album) comments.push(`ALBUM=${tags.album}`)
  if (tags.year && tags.year > 0) comments.push(`DATE=${tags.year}`)
  if (tags.trackNo && tags.trackNo > 0) comments.push(`TRACKNUMBER=${tags.trackNo}`)
  if (tags.discNo && tags.discNo > 0) comments.push(`DISCNUMBER=${tags.discNo}`)
  if (lyric && lyric.trim().length > 0) comments.push(`LYRICS=${lyric}`)

  const commentData = Buffer.concat(comments.map((c) => {
    const buf = Buffer.from(c, 'utf8')
    const len = Buffer.alloc(4)
    len.writeUInt32BE(buf.length, 0)
    return Buffer.concat([len, buf])
  }))

  // Vendor string (empty)
  const vendorLen = Buffer.alloc(4)
  vendorLen.writeUInt32BE(0, 0)
  // Number of comments
  const numComments = Buffer.alloc(4)
  numComments.writeUInt32BE(comments.length, 0)

  const data = Buffer.concat([vendorLen, numComments, commentData])
  return buildMetadataBlock(3, data)
}

/**
 * Picture block (type 5)
 * - 32-bit type (3 = front cover)
 * - 32-bit MIME type length + MIME type
 * - 32-bit description length + description
 * - 32-bit width, height, depth, colors
 * - 32-bit data length + image data
 */
const writePicture = (picture: Buffer): Buffer => {
  const mime = 'image/jpeg'
  const description = 'Cover'
  const data = Buffer.alloc(4 * 3 + mime.length + description.length + 4 + picture.length)

  let offset = 0
  // Type: 3 = front cover
  data.writeUInt32BE(3, offset); offset += 4
  // MIME type
  data.writeUInt32BE(mime.length, offset); offset += 4
  data.write(mime, offset, 'utf8'); offset += mime.length
  // Description
  data.writeUInt32BE(description.length, offset); offset += 4
  data.write(description, offset, 'utf8'); offset += description.length
  // Width, height, depth, colors (0 = unknown)
  data.writeUInt32BE(0, offset); offset += 4
  data.writeUInt32BE(0, offset); offset += 4
  data.writeUInt32BE(0, offset); offset += 4
  data.writeUInt32BE(0, offset); offset += 4
  // Image data
  data.writeUInt32BE(picture.length, offset); offset += 4
  picture.copy(data, offset)

  return buildMetadataBlock(5, data)
}

const buildMetadataBlock = (type: number, data: Buffer): Buffer => {
  // Header: byte 0 = 1 bit LAST_METADATA_BLOCK (0) + 7 bits BLOCK_TYPE
  //         bytes 1-3 = 24-bit LENGTH (big-endian)
  const header = Buffer.alloc(4)
  header[0] = type & 0x7f
  header[1] = (data.length >> 16) & 0xff
  header[2] = (data.length >> 8) & 0xff
  header[3] = data.length & 0xff
  return Buffer.concat([header, data])
}

/**
 * 将元数据标签写入 FLAC 文件。
 */
export const writeFlacTags = async (filePath: string, tags: FileTags): Promise<void> => {
  const { readFile, writeFile: fsWriteFile } = await import('node:fs/promises')

  let fileData: Buffer
  try {
    fileData = await readFile(filePath)
  } catch {
    return
  }

  // Check magic bytes
  if (fileData.toString('latin1', 0, 4) !== 'fLaC') return

  // Parse metadata blocks to find audio data offset
  let offset = 4 // skip "fLaC"
  let metadataEnd = 4
  let hasVorbisComment = false

  while (offset < fileData.length) {
    const header = fileData.readUInt32BE(offset)
    const isLast = (header & 0x800000) !== 0
    const type = (header >> 16) & 0x7f
    const length = header & 0x00ffffff

    if (type === 3) hasVorbisComment = true

    offset += 4 + length

    if (isLast) {
      metadataEnd = offset
      break
    }
  }

  const audioData = fileData.subarray(metadataEnd)

  // Build new metadata blocks
  const newBlocks: Buffer[] = []

  // Keep existing STREAMINFO (type 0) if present
  let currentOffset = 4
  while (currentOffset < metadataEnd) {
    const header = fileData.readUInt32BE(currentOffset)
    const isLast = (header & 0x800000) !== 0
    const type = (header >> 16) & 0x7f
    const length = header & 0x00ffffff

    // Keep STREAMINFO (0), PADDING (1), APPLICATION (2), CUESHEET (4)
    if (type === 0 || type === 1 || type === 2 || type === 4) {
      newBlocks.push(fileData.subarray(currentOffset, currentOffset + 4 + length))
    }

    currentOffset += 4 + length
    if (isLast) break
  }

  // Add VORBIS_COMMENT block
  if (!hasVorbisComment || (tags.title || tags.artist || tags.album || tags.lyric)) {
    newBlocks.push(writeVorbisComment(tags, tags.lyric ?? null))
  }

  // Add PICTURE block
  if (tags.picture && tags.picture.length > 0) {
    newBlocks.push(writePicture(tags.picture))
  }

  // Mark the last block
  const lastBlock = newBlocks[newBlocks.length - 1]
  if (lastBlock && lastBlock.length > 0) {
    lastBlock[0] |= 0x80
  }

  // Rebuild file: magic + metadata blocks + audio data
  const result = Buffer.concat([Buffer.from('fLaC', 'latin1'), ...newBlocks, audioData])

  await fsWriteFile(filePath, result)
}
