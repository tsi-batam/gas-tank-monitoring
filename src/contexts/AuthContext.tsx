import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'
import { getProfile, signIn, signOut } from '../services/auth'

interface Ctx {
  session: Session | null
  profile: Profile | null
  loading: boolean
  login: (u: string, p: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<Ctx>({
  session: null,
  profile: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return

      if (error) {
        setSession(null)
        setProfile(null)
        setLoading(false)
        return
      }

      setSession(data.session)

      if (!data.session) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const nextProfile = await getProfile(data.session.user.id)
        if (!mounted) return
        setProfile(nextProfile)
      } catch {
        if (!mounted) return
        setProfile(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      if (!mounted) return
      setSession(nextSession)

      // Profile loading is handled explicitly by login() and the initial session load.
      // Avoid querying Supabase from inside this callback to prevent auth event races.
      if (!nextSession) setProfile(null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const login = async (username: string, password: string) => {
    const { session: loginSession, user: loginUser } = await signIn(username, password)

    if (!loginSession || !loginUser) {
      throw new Error('Login berhasil tetapi session tidak ditemukan.')
    }

    try {
      const nextProfile = await getProfile(loginUser.id)
      setSession(loginSession)
      setProfile(nextProfile)
    } catch (error) {
      await supabase.auth.signOut()
      throw error instanceof Error
        ? error
        : new Error('Profile pengguna tidak dapat dibaca.')
    }
  }

  const logout = async () => {
    await signOut()
    setSession(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
