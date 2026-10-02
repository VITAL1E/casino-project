// Wallet + error state shared by the classic games. The balance always comes from the server.
import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import { getWallet, resetWallet } from '../../lib/walletApi'
import { useAuth } from '../../lib/auth/context'

export const useClassic = () => {
  const { user, openAuth } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    if (user) getWallet().then(r => { if (live) setBalance(r.balance) }).catch(() => { /* shown as a dash */ })
    return () => { live = false }
  }, [user])

  // Runs one server call: opens the login modal for guests, shows the server's message on failure.
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (!user) { openAuth('login'); return undefined }
    setError('')
    setBusy(true)
    try { return await fn() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong'); return undefined }
    finally { setBusy(false) }
  }, [user, openAuth])

  const reset = async () => {
    if (!user) return openAuth('login')
    try { setBalance((await resetWallet()).balance); setError('') }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not reset your balance') }
  }

  return { user, balance: user ? balance : null, setBalance, error, setError, busy, run, reset }
}

export const round2 = (n: number) => Math.round(n * 100) / 100
export const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
