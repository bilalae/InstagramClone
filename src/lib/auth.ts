import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

export type AuthProfile = {
  username: string
  name: string
  avatar: string
  password: string
  id: string
}

export async function getRemoteProfile(user: User): Promise<AuthProfile> {
  const metadata = user.user_metadata || {}
  const username = String(metadata.username || user.email?.split('@')[0] || `user_${user.id.slice(0, 8)}`).replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30) || `user_${user.id.slice(0, 8)}`
  const existing = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', user.id).maybeSingle()
  if (existing.error) throw existing.error
  const { data, error } = existing.data ? existing : await supabase.from('profiles').insert({
    id: user.id,
    username,
    display_name: String(metadata.display_name || metadata.name || ''),
  }).select('id, username, display_name, avatar_url').single()
  if (error) throw error
  if (!data) throw new Error('Unable to create your profile.')
  return {
    id: data.id,
    username: data.username,
    name: data.display_name,
    avatar: data.avatar_url || `https://i.pravatar.cc/120?img=47`,
    password: '',
  }
}

export async function signUpRemote(email: string, password: string, username: string, name: string) {
  const normalizedUsername = username.replace(/[^a-zA-Z0-9._]/g, '').toLowerCase().slice(0, 30)
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: normalizedUsername, display_name: name, onboarding_completed: false } } })
  if (error) throw error
  if (!data.user) throw new Error('Supabase did not return a user.')
  return data
}

export async function signInRemote(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.user) throw new Error('Supabase did not return a user.')
  return data
}
