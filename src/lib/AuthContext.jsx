import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.rpc('get_my_profile')
    setProfile(data?.[0] ?? null)
    setLoading(false)
  }

  // Refresh the cached profile from the database without touching `loading`,
  // so a background refresh never flashes the app's loading screen.
  async function refreshProfile() {
    const { data } = await supabase.rpc('get_my_profile')
    if (data?.[0]) setProfile(data[0])
    return data?.[0] ?? null
  }

  // Write a partial update to the caller's own profile row, then re-read it
  // through get_my_profile so what's on screen matches what's stored.
  //
  // Only send fields the agent is allowed to change: first_name, last_name,
  // phone, avatar_url. title / account_type / finance_access are blocked by a
  // database trigger and will throw.
  async function updateProfile(updates) {
    if (!user) return { data: null, error: new Error('Not signed in.') }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (error) return { data: null, error }

    const fresh = await refreshProfile()
    return { data: fresh, error: null }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signIn, signOut, updateProfile, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
