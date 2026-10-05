export function extractHashtags(text: string): string[] {
  return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map(tag => tag.slice(1).toLowerCase()))]
}

export function extractMentions(text: string): string[] {
  return [...new Set((text.match(/@([a-zA-Z0-9._]+)/g) || []).map(mention => mention.slice(1).toLowerCase()))]
}

export function validateMedia(file: File, kind: 'image' | 'video' | 'any' = 'any') {
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  const validType = kind === 'image' ? isImage : kind === 'video' ? isVideo : isImage || isVideo
  const maxBytes = isVideo ? 100 * 1024 * 1024 : 25 * 1024 * 1024
  if (!validType) throw new Error(`Please choose a valid ${kind === 'any' ? 'image or video' : kind} file.`)
  if (file.size > maxBytes) throw new Error(`This file is too large. Maximum size is ${isVideo ? '100MB' : '25MB'}.`)
}
