import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import SocialAuth from './SocialAuth'
import { register, login, logout, me, oauthStartUrl, type User, type OAuthProviderId, AuthApiError } from '../lib/authApi'
import { walletConnectors, WalletError } from '../lib/wallets'
import { AuthContext, type AuthMode } from '../lib/auth/context'

type Mode = AuthMode

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<Mode | null>(null)
  const [showPw, setShowPw] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [busyProvider, setBusyProvider] = useState<string | null>(null)

  useEffect(() => { me().then(setUser).catch(() => {}) }, [])

  useEffect(() => {
    if (!mode) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMode(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  const openAuth = (m: Mode) => { setError(null); setMode(m) }
  const signOut = () => { logout().catch(() => {}); setUser(null) }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username') ?? '')
    const password = String(form.get('password') ?? '')
    const email = String(form.get('email') ?? '')
    setBusy(true)
    setError(null)
    try {
      const u = mode === 'register' ? await register(username, password, email) : await login(username, password)
      setUser(u)
      setMode(null)
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  // Google/Discord: full-page redirect, the server does the rest and sends
  // the browser back here with the session cookie already set.
  const signInWithOAuth = (provider: OAuthProviderId) => {
    window.location.href = oauthStartUrl(provider)
  }

  // MetaMask/Phantom: sign a server-issued nonce, no redirect needed.
  const signInWithWallet = async (id: string) => {
    const connector = walletConnectors[id]
    if (!connector) return
    setError(null)
    setBusyProvider(id)
    try {
      const u = await connector.connect()
      setUser(u)
      setMode(null)
    } catch (err) {
      setError(err instanceof WalletError || err instanceof AuthApiError ? err.message : 'Wallet sign-in failed')
    } finally {
      setBusyProvider(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, openAuth, signOut, error, busyProvider, signInWithOAuth, signInWithWallet }}>
      {children}
      {mode && (
        <div className="auth-overlay" onMouseDown={e => e.target === e.currentTarget && setMode(null)}>
          <div className="auth-modal" role="dialog" aria-modal="true">
            <div className="auth-tabs" data-mode={mode}>
              <span className="auth-tab-pill" />
              <button className={`auth-tab${mode === 'login' ? ' auth-tab--on' : ''}`} onClick={() => { setError(null); setMode('login') }}>Login</button>
              <button className={`auth-tab${mode === 'register' ? ' auth-tab--on' : ''}`} onClick={() => { setError(null); setMode('register') }}>Register</button>
            </div>

            <form className="auth-form" onSubmit={submit}>
              <label className="auth-field">
                <span>Username</span>
                <input name="username" type="text" placeholder="Username" autoComplete="username" required minLength={3} maxLength={32} />
              </label>
              <label className="auth-field">
                <span>Password</span>
                <div className="auth-pw">
                  <input name="password" type={showPw ? "text" : "password"} placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
                  <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
                    {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <div className={`auth-collapse${mode === 'register' ? ' auth-collapse--open' : ''}`}>
                <label className="auth-field">
                  <span>Email <em>(optional)</em></span>
                  <input name="email" type="email" placeholder="you@example.com" autoComplete="email" tabIndex={mode === 'register' ? 0 : -1} />
                </label>
              </div>
              <div className={`auth-collapse${mode === 'register' ? ' auth-collapse--open' : ''}`}>
                <label className="auth-field">
                  <span>Referral code <em>(optional)</em></span>
                  <input type="text" placeholder="Referral code" autoComplete="off" tabIndex={mode === 'register' ? 0 : -1} />
                </label>
              </div>
              {error && <p className="auth-error">{error}</p>}
              <button type="submit" className="auth-submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Login'}
              </button>
            </form>

            <div className="auth-or"><span>or continue with</span></div>
            <SocialAuth />

            <div className={`auth-collapse${mode === 'register' ? ' auth-collapse--open' : ''}`}>
              <p className="auth-fine">By registering you confirm you are 18+ and accept the Terms of Service.</p>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  )
}
