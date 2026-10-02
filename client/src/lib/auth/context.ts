// The auth context object lives in its own module, separate from the
// AuthProvider/modal component (components/AuthModal.tsx). SocialAuth is
// rendered both inside that modal and standalone in the hero, so it needs
// useAuth() without importing the component that renders it — importing
// straight from AuthModal.tsx here would be a cycle.
import { createContext, useContext } from 'react'
import type { User, OAuthProviderId } from '../authApi'

export type AuthMode = 'login' | 'register'

export type AuthCtx = {
  user: User | null
  openAuth: (mode: AuthMode) => void
  signOut: () => void
  error: string | null
  busyProvider: string | null
  signInWithOAuth: (provider: OAuthProviderId) => void
  signInWithWallet: (id: string) => void
  guestLogin: () => Promise<boolean>   // TEMPORARY (testing): true when a guest account was created
}

const noop = () => {}

export const AuthContext = createContext<AuthCtx>({
  user: null,
  openAuth: noop,
  signOut: noop,
  error: null,
  busyProvider: null,
  signInWithOAuth: noop,
  signInWithWallet: noop,
  guestLogin: async () => false,
})

export const useAuth = () => useContext(AuthContext)
