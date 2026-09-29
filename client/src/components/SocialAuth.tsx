import { Ghost } from 'lucide-react'
import { useAuth } from '../lib/auth/context'
import { walletConnectors } from '../lib/wallets'

const SocialAuth = () => {
  const { busyProvider, signInWithOAuth, signInWithWallet } = useAuth()

  return (
    <div className="hero-auth-social">
      <button
        className="auth-social-btn"
        title="Continue with Google"
        aria-label="Google"
        disabled={busyProvider !== null}
        onClick={() => signInWithOAuth('google')}
      >
        <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      </button>
      <button
        className="auth-social-btn"
        title="Continue with Discord"
        aria-label="Discord"
        disabled={busyProvider !== null}
        onClick={() => signInWithOAuth('discord')}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--brand-discord)"><path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.74 19.74 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.11 13.11 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z"/></svg>
      </button>
      <button
        className="auth-social-btn"
        title="Continue with Phantom"
        aria-label="Phantom"
        disabled={busyProvider !== null}
        onClick={() => signInWithWallet('phantom')}
      >
        {busyProvider === 'phantom'
          ? <span className="auth-social-spinner" />
          : <Ghost size={20} color="var(--brand-phantom)" fill="var(--brand-phantom)" />}
      </button>
      <button
        className="auth-social-btn"
        title="Continue with MetaMask"
        aria-label="MetaMask"
        disabled={busyProvider !== null}
        onClick={() => signInWithWallet('metamask')}
      >
        {busyProvider === 'metamask'
          ? <span className="auth-social-spinner" />
          : <svg viewBox="0 0 24 24" width="20" height="20" fill="var(--brand-metamask)"><path d="M21 3l-8 6 1.5 3.5L21 3zM3 3l8 6-1.5 3.5L3 3zM6 15l2 5 4-1.5 4 1.5 2-5-3-2H9l-3 2z"/></svg>}
      </button>
      {import.meta.env.DEV && Object.values(walletConnectors).every(c => !c.isAvailable()) && (
        <span className="auth-social-hint">No wallet extension detected</span>
      )}
    </div>
  )
}

export default SocialAuth
