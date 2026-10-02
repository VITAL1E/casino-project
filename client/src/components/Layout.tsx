import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import {
  Menu, Home, Search, Dices, Trophy, Gamepad2, Star, Tv2, LayoutGrid,
  Volleyball, Swords, Target, Crosshair, Medal, Gift, Flame, Crown, BookOpen, MessageCircle,
} from 'lucide-react'
import Footer from './Footer'
import ChatWidget from './ChatWidget'
import CookieBanner from './CookieBanner'
import { AuthProvider } from './AuthModal'
import { useAuth } from '../lib/auth/context'

type Item = { icon: typeof Home; label: string; to?: string }

const MAIN_NAV: Item[] = [
  { icon: Home,   label: 'Home', to: '/' },
  { icon: Search, label: 'Search' },
]

const CASINO_NAV: Item[] = [
  { icon: Gamepad2,   label: 'Arcades',      to: '/casino?group=arcade' },
  { icon: Dices,      label: 'Classics',     to: '/casino?group=classics' },
  { icon: Star,       label: 'Slots',        to: '/casino?group=slots' },
  { icon: Tv2,        label: 'Live Casino',  to: '/casino?group=live' },
  { icon: LayoutGrid, label: 'All Games',    to: '/casino' },
]

const SPORT_NAV: Item[] = [
  { icon: Trophy,     label: 'Soccer',            to: '/sports?sport=soccer' },
  { icon: Volleyball, label: 'Basketball',        to: '/sports?sport=basketball' },
  { icon: Swords,     label: 'American Football', to: '/sports?sport=american-football' },
  { icon: Target,     label: 'Tennis',            to: '/sports?sport=tennis' },
  { icon: Crosshair,  label: 'Counter-strike',    to: '/sports?sport=counter-strike' },
  { icon: Medal,      label: 'All Sports',        to: '/sports' },
]

const REWARDS_NAV: Item[] = [
  { icon: Gift,  label: 'Promotions', to: '/promotions' },
  { icon: Flame, label: 'Challenges', to: '/challenges' },
  { icon: Crown, label: 'VIP', to: '/vip' },
]

const MORE_NAV: Item[] = [
  { icon: BookOpen, label: 'Blog', to: '/blog' },
]

const Group = ({ items, title, current }: { items: Item[]; title?: string; current: string }) => (
  <>
    <div className="sidebar-sep" />
    {title && <div className="sidebar-title">{title}</div>}
    {items.map(({ icon: Icon, label, to }) => {
      const cls = `sidebar-item${to && to === current ? ' sidebar-item--on' : ''}`
      const inner = (
        <>
          <Icon size={18} strokeWidth={1.5} />
          <span className="sidebar-label">{label}</span>
        </>
      )
      return to ? (
        <Link key={label} to={to} className={cls} title={label}>{inner}</Link>
      ) : (
        <button key={label} className={cls} title={label}>{inner}</button>
      )
    })}
  </>
)

const isMobile = () => window.matchMedia('(max-width: 768px)').matches

const LayoutInner = ({ children }: { children: ReactNode }) => {
  const { openAuth } = useAuth()
  const [open, setOpen] = useState(false)   // sidebar starts collapsed on every screen size
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const sport = pathname.startsWith('/sports')
  const current = `${pathname}${search}`

  return (
    <div className={`layout${open ? ' layout--open' : ''}`}>
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <aside
        className="sidebar"
        onClick={e => {
          if (isMobile() && (e.target as HTMLElement).closest('a')) setOpen(false)
        }}
      >
        <div className="sidebar-head">
          <button
            className="sidebar-menu"
            title={open ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
          >
            <Menu size={18} strokeWidth={1.5} />
          </button>

          <div className="sidebar-modes-h">
            <button
              className={`sidebar-mode-h${!sport ? ' sidebar-mode-h--on' : ''}`}
              onClick={() => navigate('/casino')}
            >
              Casino
            </button>
            <button
              className={`sidebar-mode-h${sport ? ' sidebar-mode-h--on' : ''}`}
              onClick={() => navigate('/sports')}
            >
              Sports
            </button>
          </div>
        </div>

        <div className="sidebar-modes">
          <button
            className={`sidebar-mode${!sport ? ' sidebar-mode--on' : ''}`}
            onClick={() => navigate('/casino')}
            title="Casino"
          >
            <Dices size={18} strokeWidth={1.5} />
          </button>
          <button
            className={`sidebar-mode${sport ? ' sidebar-mode--on' : ''}`}
            onClick={() => navigate('/sports')}
            title="Sport"
          >
            <Trophy size={18} strokeWidth={1.5} />
          </button>
        </div>

        {sport ? (
          <Group items={SPORT_NAV} title="Sports" current={current} />
        ) : (
          <>
            <Group items={MAIN_NAV} current={current} />
            <Group items={CASINO_NAV} title="Games" current={current} />
          </>
        )}
        <Group items={REWARDS_NAV} title="Rewards" current={current} />
        <Group items={MORE_NAV} title="More" current={current} />
      </aside>

      <nav className="top-nav">
        <Link to="/" className="logo">
          <span className="logo-glitch" data-text="STACKX">STACKX</span>
        </Link>

        <div className="nav-right">
          <button className="nav-btn-login" onClick={() => openAuth("login")}>Login</button>
          <button className="nav-btn-signup" onClick={() => openAuth("register")}>Register</button>
        </div>
      </nav>

      <div className="layout-body">
        <main className="main-content">
          {children}
          <Footer />
        </main>
      </div>

      <ChatWidget />
      <CookieBanner />

      <nav className="mobile-tabs">
        <button className={`mobile-tab${open ? ' mobile-tab--on' : ''}`} onClick={() => setOpen(o => !o)}>
          <Menu size={20} strokeWidth={1.75} />
          Menu
        </button>
        <button
          className={`mobile-tab${!sport && pathname !== '/' ? ' mobile-tab--on' : ''}`}
          onClick={() => { setOpen(false); navigate('/casino') }}
        >
          <Dices size={20} strokeWidth={1.75} />
          Casino
        </button>
        <button
          className={`mobile-tab${sport ? ' mobile-tab--on' : ''}`}
          onClick={() => { setOpen(false); navigate('/sports') }}
        >
          <Trophy size={20} strokeWidth={1.75} />
          Sports
        </button>
        <button className="mobile-tab" onClick={() => { setOpen(false); navigate('/casino') }}>
          <Search size={20} strokeWidth={1.75} />
          Search
        </button>
        <button className="mobile-tab">
          <MessageCircle size={20} strokeWidth={1.75} />
          Chat
        </button>
      </nav>
    </div>
  )
}

const Layout = ({ children }: { children: ReactNode }) => (
  <AuthProvider><LayoutInner>{children}</LayoutInner></AuthProvider>
)

export default Layout
