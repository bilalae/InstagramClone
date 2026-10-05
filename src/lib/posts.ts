import { supabase } from './supabase'

export async function createRemotePost(userId: string, caption: string, imageUrl: string, location: string) {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert({ user_id: userId, caption, location, visibility: 'public', comments_enabled: true, likes_hidden: false })
    .select('id, created_at')
    .single()
  if (postError) throw postError
  const { error: mediaError } = await supabase.from('post_media').insert({
    post_id: post.id,
    media_url: imageUrl,
    media_type: 'image',
    order_index: 0,
  })
  if (mediaError) {
    await supabase.from('posts').delete().eq('id', post.id)
    throw mediaError
  }
  return post
}
