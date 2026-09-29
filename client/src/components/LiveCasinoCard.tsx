const LIVE_GAMES = [
  { name: 'Blackjack VIP', players: 312, img: 'https://images.unsplash.com/photo-1655159428752-c700435e9983?w=600&q=80' },
  { name: 'Roulette Live', players: 541, img: 'https://images.unsplash.com/photo-1627831389670-d20f5a01c536?w=600&q=80' },
  { name: 'Baccarat',      players: 198, img: 'https://images.unsplash.com/photo-1699136897382-ec50fa3a289c?w=600&q=80' },
  { name: 'Game Shows',    players: 874, img: 'https://images.unsplash.com/photo-1618304925090-b68a8c744cbe?w=600&q=80' },
  { name: 'Poker Live',    players: 227, img: 'https://images.unsplash.com/photo-1626775238053-4315516eedc9?w=600&q=80' },
]

const LiveCasinoCard = () => (
  <section className="live-casino-card">
    <div className="card-header">
      <span className="live-badge">LIVE CASINO</span>
      <button className="view-all">VIEW ALL →</button>
    </div>
    <div className="live-games-strip">
      {LIVE_GAMES.map(({ name, players, img }) => (
        <div key={name} className="live-game-tile">
          <div className="live-game-img" style={{ backgroundImage: `url(${img})` }}>
            <span className="live-tile-badge">LIVE</span>
            <div className="live-game-overlay">
              <p className="live-game-name">{name}</p>
              <p className="live-game-players">👤 {players}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  </section>
)

export default LiveCasinoCard
