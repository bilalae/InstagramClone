import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const normalizeSupabaseUrl = (value: string | undefined) => {
  if (!value) return ''
  const trimmed = value.trim()

  try {
    const url = new URL(trimmed)
    const pathname = url.pathname.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')
    url.pathname = pathname || '/'
    return `${url.origin}${pathname ? pathname : ''}`
  } catch {
    return trimmed.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')
  }
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

// A privileged key must never become a browser credential.
let privilegedKey = supabaseAnonKey.startsWith('sb_secret_')
try {
  const payload = supabaseAnonKey.split('.')[1]
  if (payload) privilegedKey ||= JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'
} catch { /* Publishable keys are not JWTs. */ }
if (privilegedKey) throw new Error('A service-role key cannot be used in the browser. Configure a publishable key.')

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  supabaseAnonKey &&
  supabaseAnonKey !== 'placeholder-anon-key',
)

const supabaseGlobal = globalThis as typeof globalThis & { __instagramSupabase?: SupabaseClient }

export const supabase = supabaseGlobal.__instagramSupabase ?? createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  )

if (!supabaseGlobal.__instagramSupabase) supabaseGlobal.__instagramSupabase = supabase
