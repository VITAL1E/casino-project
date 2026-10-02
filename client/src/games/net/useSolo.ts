// Connection + wallet state for the single-player, server-authoritative games. The component supplies
// `onSnap` (mirror the snapshot into its own render state); everything money-related comes from the server.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getWallet, resetWallet } from '../../lib/walletApi'
import { ApiError } from '../../lib/apiClient'
import { me } from '../../lib/authApi'
import { useAuth } from '../../lib/auth/context'
import { openSoloSocket, type SoloProof, type SoloResult, type SoloServerMsg, type SoloSocket } from './solo'

export type SoloPhase = 'connecting' | 'idle' | 'playing' | 'done' | 'offline'
export type SoloOffline = 'login' | 'server' | 'lost'

export const useSolo = <S,>(key: string, onSnap: (snap: S, kind: 'started' | 'snap' | 'done') => void) => {
  const { user, openAuth, guestLogin } = useAuth()
  const pendingStart = useRef<{ amount: number; opts: Record<string, unknown> } | null>(null)   // TEMPORARY (guest play)
  const [balance, setBalance] = useState<number | null>(null)
  const [phase, setPhase] = useState<SoloPhase>('connecting')
  const [offline, setOffline] = useState<SoloOffline>('lost')
  const [error, setError] = useState('')
  const [result, setResult] = useState<SoloResult | null>(null)
  const [bet, setBet] = useState(0)
  const [proof, setProof] = useState<SoloProof | null>(null)   // provably fair games say which seeds the run used
  const [connKey, setConnKey] = useState(0)
  const sock = useRef<SoloSocket | null>(null)
  const handler = useRef(onSnap)
  useEffect(() => { handler.current = onSnap }, [onSnap])

  useEffect(() => {
    const onMsg = (msg: SoloServerMsg) => {
      switch (msg.t) {
        case 'ready':
          setBalance(msg.balance)
          if (!msg.resume) setPhase(p => (p === 'connecting' || p === 'offline' ? 'idle' : p))   // else started follows
          if (pendingStart.current && !msg.resume) { sock.current?.send({ t: 'start', bet: pendingStart.current.amount, opts: pendingStart.current.opts }); pendingStart.current = null }
          break
        case 'started':
          setBalance(msg.balance)
          setBet(msg.bet)
          setProof(msg.proof ?? null)
          setError('')
          setResult(null)
          handler.current(msg.snap as S, 'started')
          setPhase('playing')
          break
        case 'snap':
          handler.current(msg.snap as S, 'snap')
          break
        case 'done':
          handler.current(msg.snap as S, 'done')
          if (msg.proof) setProof(msg.proof)
          setBalance(msg.balance)
          setResult({ result: msg.result, payout: msg.payout, bet: msg.bet, balance: msg.balance, mult: msg.mult })
          setPhase('done')
          break
        case 'error':
          setError(msg.message)
          break
      }
    }
    sock.current = openSoloSocket(key, onMsg, () => {
      sock.current = null
      // the browser hides why a WebSocket upgrade failed, so ask the API: logged out, server down, or something else
      me()
        .then(u => setOffline(u ? 'lost' : 'login'))
        .catch(() => setOffline('server'))
        .finally(() => setPhase('offline'))
    })
    return () => { sock.current?.close(); sock.current = null }
  }, [key, connKey, user?.id])   // logging in or out reconnects with the new session

  const start = useCallback(async (amount: number, opts: Record<string, unknown>) => {
    if (phase === 'offline' && offline === 'login') {
      // TEMPORARY: with GUEST_PLAY=1 on the server a guest account is created and the run starts; otherwise the login modal opens
      if (await guestLogin()) { pendingStart.current = { amount, opts }; return }
      return openAuth('login')
    }
    setError('')
    sock.current?.send({ t: 'start', bet: amount, opts })
  }, [phase, offline, openAuth, guestLogin])

  const act = useCallback((a: 'flap' | 'go' | 'cash') => sock.current?.send({ t: 'act', a }), [])

  const reset = async () => {
    try { setBalance((await resetWallet()).balance); setError('') }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not reset your balance') }
  }
  const refreshWallet = () => { getWallet().then(r => setBalance(r.balance)).catch(() => { /* the socket keeps the balance current */ }) }
  const reconnect = () => { setPhase('connecting'); setConnKey(k => k + 1) }

  return { balance, phase, offline, error, setError, result, bet, proof, start, act, reset, refreshWallet, reconnect }
}
