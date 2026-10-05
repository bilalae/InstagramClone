import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function subscribeToConversation(conversationId: string, onMessage: (message: Record<string, unknown>) => void): RealtimeChannel {
  return supabase.channel(`conversation:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, payload => onMessage(payload.new as Record<string, unknown>))
    .subscribe()
}

export function subscribeToNotifications(userId: string, onNotification: (notification: Record<string, unknown>) => void): RealtimeChannel {
  return supabase.channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => onNotification(payload.new as Record<string, unknown>))
    .subscribe()
}

export function subscribeToPresence(channelName: string, userId: string, onPresence: (state: Record<string, unknown>) => void) {
  const channel = supabase.channel(channelName, { config: { presence: { key: userId } } })
  channel.on('presence', { event: 'sync' }, () => onPresence(channel.presenceState())).subscribe(async status => {
    if (status === 'SUBSCRIBED') await channel.track({ online_at: new Date().toISOString() })
  })
  return channel
}
