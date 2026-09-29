import { useState } from 'react'
import { Cookie } from 'lucide-react'

const KEY = 'stack.cookies.accepted'

const CookieBanner = () => {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })

  if (dismissed) return null

  const accept = () => {
    try { localStorage.setItem(KEY, '1') } catch { /* storage unavailable — just hide for this visit */ }
    setDismissed(true)
  }

  return (
    <div className="cookie-banner">
      <Cookie size={18} strokeWidth={1.75} />
      <p>We use cookies to provide you with the best possible experience.</p>
      <button className="cookie-btn cookie-btn--ghost">Learn More</button>
      <button className="cookie-btn cookie-btn--accept" onClick={accept}>Accept</button>
    </div>
  )
}

export default CookieBanner
