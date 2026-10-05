import { supabase } from './supabase'
import { validateMedia } from './content'

export async function uploadMedia(userId: string, bucket: 'avatars' | 'posts' | 'reels' | 'stories' | 'messages', file: File, ownerId: string, kind: 'image' | 'video' | 'any' = 'any') {
  validateMedia(file, kind)
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${userId}/${ownerId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
  if (error) throw error
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { path, url: data.publicUrl }
}
