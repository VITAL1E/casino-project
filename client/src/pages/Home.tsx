import { useNavigate } from 'react-router-dom'
import Seo from '../components/Seo'
import { seoFor } from '../lib/seoFor'
import { Radio } from 'lucide-react'
import HeroSection from '../components/HeroSection'
import LiveWinsTable from '../components/LiveWinsTable'
import { GameRow, Row } from '../components/GameRow'
import { GROUPS } from '../data/casino'
import site from '../data/site.json'
import { SPORTS, sportArt, hasSportFile } from '../data/sports'

const NO_BONUS_BANNER = (
  <div className="no-bonus-banner">
    <span className="no-bonus-x">✕</span>
    <div>
      <p className="no-bonus-title">No fake 500% welcome bonus.</p>
      <p className="no-bonus-sub">No 47-page T&Cs. No "wagering requirements" designed to make it unreachable. Here's exactly what you get: <strong>your money, our platform, honest odds.</strong></p>
    </div>
    <span className="no-bonus-tag">ANTI-BONUS CASINO</span>
  </div>
)

const Home = () => {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <Seo {...seoFor('/')} jsonLd={{ '@context': 'https://schema.org', '@type': 'WebSite', name: site.site.name, url: site.site.url }} />
      <HeroSection />

      <LiveWinsTable />
      {NO_BONUS_BANNER}

      <div className="home-rows">
        {GROUPS.map(({ key, label }) => (
          <GameRow key={key} group={key} label={label} onMore={() => navigate(`/casino?group=${key}`)} />
        ))}

        <Row
          icon={<Radio size={18} strokeWidth={1.75} />}
          label="Live Sports"
          onMore={() => navigate('/sports')}
        >
          {SPORTS.map(({ key, label }) => (
            <button key={key} className="sport-tile" onClick={() => navigate(`/sports?sport=${key}`)}>
              <div className="sport-tile-art" style={{ background: sportArt(key), backgroundSize: 'cover', backgroundPosition: 'center' }} />
              {!hasSportFile(key) && <span className="sport-tile-name">{label}</span>}
            </button>
          ))}
        </Row>
      </div>
    </div>
  )
}

export default Home
