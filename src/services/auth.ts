import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

const DOMAIN = 'tsi-smart-products.local'

export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${DOMAIN}`

export async function signIn(username: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  })

  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,username,full_name,role,is_active')
    .eq('id', userId)
    .single()

  if (error) {
    throw new Error(`Profile gagal dibaca: ${error.message}`)
  }

  if (!data.is_active) {
    throw new Error('Akun sedang dinonaktifkan.')
  }

  return data as Profile
}
