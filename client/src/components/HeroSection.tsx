import SocialAuth from "./SocialAuth"
import SadWallet from "./SadWallet"
import { useAuth } from "../lib/auth/context"

const HeroSection = () => {
  const { openAuth } = useAuth()
  return (
  <section className="hero-section">
    <div className="hero-content">
      <p className="hero-subtitle">// welcome to the degen den</p>
      <h1 className="hero-title">
        HOUSE OF WORLD'S<br />GREATEST DEGENS
      </h1>
      <p className="hero-tagline">High stakes, higher spirits. Pull up a chair.</p>
      <div className="hero-ctas">
        <button className="btn-primary">PLAY NOW</button>
        <span className="hero-cta-disclaimer">— your wallet asked us to say "are you sure?"</span>
      </div>
      <div className="hero-auth">
        <div className="hero-auth-main">
          <button className="nav-btn-login" onClick={() => openAuth("login")}>Login</button>
          <button className="nav-btn-signup" onClick={() => openAuth("register")}>Register</button>
        </div>
        <span className="hero-auth-sep" />
        <SocialAuth />

      </div>
      <SadWallet />
    </div>

    <div className="hero-right">
      <div className="hero-stat-card">
        <span className="hero-stat-value">2.7%</span>
        <span className="hero-stat-label">House Edge. Always.</span>
      </div>
      <div className="hero-stat-card">
        <span className="hero-stat-value">47 min</span>
        <span className="hero-stat-label">Avg session before "one more"</span>
      </div>
      <div className="hero-stat-card hero-stat-card--red">
        <span className="hero-stat-value">96%</span>
        <span className="hero-stat-label">RTP — not 100%. Do the math.</span>
      </div>
    </div>
  </section>
  )
}

export default HeroSection
