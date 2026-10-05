import { supabase } from './supabase'

export type RemoteMessage = {
  id: string
  conversation_id: string
  sender_id: string
  message_type: string
  body: string | null
  created_at: string
}

export async function loadMessages(userId: string) {
  const { data: memberships, error: membershipError } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId)
  if (membershipError) throw membershipError
  const ids = (memberships || []).map(member => member.conversation_id)
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, message_type, body, created_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true })
    .range(0, 99)
  if (error) throw error
  return data || []
}

export async function getOrCreateDirectConversation(otherUserId: string) {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { target_user_id: otherUserId })
  if (error) throw error
  return data as string
}

export async function sendRemoteMessage(userId: string, conversationId: string, body: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: userId, message_type: 'text', body, reply_to_message_id: null })
    .select('id, conversation_id, sender_id, message_type, body, created_at')
    .single()
  if (error) throw error
  return data
}
