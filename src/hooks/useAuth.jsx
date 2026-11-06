import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Who's signed in (Kick / Discord, server/auth.js), shared by the top bar, the
// admin page and anything that needs an account. `admin` comes from the server.
// `rainbet` is the account's approved Rainbet username (null: none; undefined:
// not known, e.g. /api/auth/me failed); usePlayer follows it for the side nav.

const AuthContext = createContext({ status: 'loading', user: null, admin: false, rainbet: undefined })

const here = () => window.location.pathname + window.location.search

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, admin: false, mod: false, rainbet: undefined, error: null })

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
      const data = await res.json()
      const rainbet = res.ok ? (data.user ? (data.rainbet ?? null) : null) : undefined
      setState((s) => ({ ...s, status: 'ready', user: data.user ?? null, admin: Boolean(data.admin), mod: Boolean(data.mod), rainbet }))
    } catch {
      setState((s) => ({ ...s, status: 'ready', user: null, admin: false, mod: false, rainbet: undefined }))
    }
  }, [])

  useEffect(() => {
    refresh()
    // a failed sign-in comes back as ?auth_error=…: keep it to show, then tidy the URL
    const url = new URL(window.location.href)
    const error = url.searchParams.get('auth_error')
    if (error) {
      setState((s) => ({ ...s, error }))
      url.searchParams.delete('auth_error')
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }, [refresh])

  const value = useMemo(
    () => ({
      ...state,
      signInWithKick: (returnTo = here()) => {
        window.location.href = `/api/auth/kick/login?return=${encodeURIComponent(returnTo)}`
      },
      signInWithDiscord: (returnTo = here()) => {
        window.location.href = `/api/auth/discord/login?return=${encodeURIComponent(returnTo)}`
      },
      signOut: async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
        setState((s) => ({ ...s, user: null, admin: false, rainbet: null }))
      },
      clearError: () => setState((s) => ({ ...s, error: null })),
      refresh,
    }),
    [state, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
