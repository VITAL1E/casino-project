import { useState, type FormEvent } from 'react'
import { Headphones, X, Send } from 'lucide-react'

type Message = { from: 'them' | 'me'; text: string }

const WELCOME: Message = { from: 'them', text: "Hey! 👋 How can we help you today?" }
const AUTO_REPLY = "Thanks for reaching out — a support agent will be with you shortly."

// Front-end only for now — no live agent behind this yet, just enough to
// match the floating-launcher + panel pattern real support widgets use.
const ChatWidget = () => {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [draft, setDraft] = useState('')

  const send = (e: FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setMessages(prev => [...prev, { from: 'me', text }])
    setDraft('')
    setTimeout(() => setMessages(prev => [...prev, { from: 'them', text: AUTO_REPLY }]), 800)
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
            {messages.map((m, i) => (
              <p key={i} className={`chat-bubble chat-bubble--${m.from}`}>{m.text}</p>
            ))}
          </div>
          <form className="chat-panel-input" onSubmit={send}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Type a message…"
              aria-label="Message"
            />
            <button type="submit" aria-label="Send"><Send size={16} strokeWidth={2} /></button>
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
