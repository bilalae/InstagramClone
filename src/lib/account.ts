import { supabase } from './supabase'
import { appUrl } from '../hooks/useRoute'

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl('/settings/password') })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

export async function deleteAccountRequest(userId: string) {
  const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_type: 'account_deletion_request', target_id: userId, reason: 'User requested account deletion.' })
  if (error) throw error
}
