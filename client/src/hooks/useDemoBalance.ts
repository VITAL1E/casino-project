import { useCallback, useState } from 'react'

const KEY = 'stack.demo.balance'
const START = 1000

const read = () => {
  try {
    const v = parseFloat(localStorage.getItem(KEY) ?? '')
    return Number.isFinite(v) ? v : START
  } catch {
    return START
  }
}

export const round2 = (n: number) => Math.round(n * 100) / 100

// Play-money wallet kept in the browser. Replace with the real wallet API later.
export const useDemoBalance = () => {
  const [balance, setBalanceState] = useState(read)

  const setBalance = useCallback((next: number | ((prev: number) => number)) => {
    setBalanceState(prev => {
      const value = round2(typeof next === 'function' ? next(prev) : next)
      try { localStorage.setItem(KEY, String(value)) } catch { /* storage unavailable */ }
      return value
    })
  }, [])

  const reset = useCallback(() => setBalance(START), [setBalance])

  return { balance, setBalance, reset }
}
