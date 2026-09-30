import { useState, type FormEvent } from 'react'
import { Headphones, X, Send } from 'lucide-react'
import { useAuth } from '../lib/auth/context'

type Message = { from: 'them' | 'me'; text: string }

const WELCOME: Message = { from: 'them', text: "Hey! 👋 How can we help you today?" }
const AUTO_REPLY = "Thanks for reaching out — a support agent will be with you shortly."

// Front-end only for now — no live agent behind this yet, just enough to
// match the floating-launcher + panel pattern real support widgets use.
const ChatWidget = () => {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)

  const send = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!user || !text) return   // chatting needs an account
    setMessages(prev => [...prev, { from: 'me', text }])
    setDraft('')
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      setMessages(prev => [...prev, { from: 'them', text: AUTO_REPLY }])
    }, 1400)
  }

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Support chat">
          <div className="chat-panel-head">
            <span><Headphones size={18} strokeWidth={1.75} /> Support</span>
            <button onClick={() => setOpen(false)} aria-label="Close chat"><X size={18} /></button>
          </div>
          <div className="chat-panel-body">
            {user ? (
              <>
                {messages.map((m, i) => (
                  <p key={i} className={`chat-bubble chat-bubble--${m.from}`}>{m.text}</p>
                ))}
                {typing && <p className="chat-bubble chat-bubble--them chat-typing" aria-label="Support is typing"><i /><i /><i /></p>}
              </>
            ) : (
              <p className="chat-bubble chat-bubble--them chat-bubble--nudge">Please log in to chat with support.</p>
            )}
          </div>
          <form className="chat-panel-input" onSubmit={send}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={user ? 'Type a message…' : 'Log in to chat'}
              disabled={!user}
              aria-label="Message"
            />
            <button type="submit" aria-label="Send" disabled={!user}><Send size={16} strokeWidth={2} /></button>
          </form>
        </div>
      )}

      <button className="support-fab" title="Support" onClick={() => setOpen(o => !o)}>
        {open ? <X size={22} strokeWidth={1.75} /> : <Headphones size={22} strokeWidth={1.75} />}
      </button>
    </>
  )
}

export default ChatWidget
