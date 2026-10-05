import { supabase } from './supabase'
import type { PostRow, Profile, PostMedia, Comment } from './database.types'

export type RemotePost = PostRow & {
  profile: Pick<Profile, 'username' | 'display_name' | 'avatar_url'>
  media: PostMedia[]
  comments: Comment[]
  likeCount: number
  liked: boolean
}

export async function loadFeed(userId: string): Promise<RemotePost[]> {
  // The posts RLS policy intentionally performs the own/followed/public
  // visibility check; keeping this query unfiltered avoids client-side
  // joins that can conflict with RLS.
  const { data: postRows, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(0, 19)
  if (error) throw error
  if (!postRows?.length) return []

  const postIds = postRows.map(post => post.id)
  const userIds = [...new Set(postRows.map(post => post.user_id))]
  const [{ data: profiles, error: profileError }, { data: media, error: mediaError }, { data: comments, error: commentsError }, { data: likes, error: likesError }] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds),
    supabase.from('post_media').select('*').in('post_id', postIds).order('order_index'),
    supabase.from('comments').select('*').in('post_id', postIds).order('created_at', { ascending: false }),
    supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds),
  ])
  if (profileError || mediaError || commentsError || likesError) throw profileError || mediaError || commentsError || likesError

  return postRows.map(post => {
    const profile = profiles?.find(item => item.id === post.user_id)
    const postLikes = likes?.filter(item => item.post_id === post.id) || []
    return {
      ...post,
      profile: profile || { username: 'unknown', display_name: '', avatar_url: null },
      media: (media || []).filter(item => item.post_id === post.id),
      comments: (comments || []).filter(item => item.post_id === post.id).slice(0, 3),
      likeCount: postLikes.length,
      liked: postLikes.some(item => item.user_id === userId),
    }
  })
}

export async function setPostLike(userId: string, postId: string, liked: boolean) {
  if (liked) {
    const { error } = await supabase.from('post_likes').delete().eq('user_id', userId).eq('post_id', postId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('post_likes').insert({ user_id: userId, post_id: postId })
    if (error) throw error
  }
}

export async function addComment(userId: string, postId: string, body: string) {
  const { data, error } = await supabase.from('comments').insert({ user_id: userId, post_id: postId, body, parent_comment_id: null }).select('*').single()
  if (error) throw error
  return data
}

export async function setSavedPost(userId: string, postId: string, saved: boolean) {
  if (saved) {
    const { error } = await supabase.from('saved_posts').delete().eq('user_id', userId).eq('post_id', postId)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('saved_posts').insert({ user_id: userId, post_id: postId, collection_id: null })
  if (error) throw error
}

export async function setFollow(followerId: string, followingId: string, following: boolean, isPrivate: boolean) {
  if (following) {
    const { error } = await supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('follows').insert({ follower_id: followerId, following_id: followingId, status: isPrivate ? 'pending' : 'accepted' })
  if (error) throw error
}
