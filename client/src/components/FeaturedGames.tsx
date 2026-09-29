const GAMES = [
  { title: 'WANTED DEAD OR A WILD', category: 'Slots', img: 'https://images.unsplash.com/photo-1587837073080-448bc6a2329b?w=400' },
  { title: 'SWEET BONANZA', category: 'Slots', img: 'https://images.unsplash.com/photo-1604881991720-f91add269bed?w=400' },
  { title: 'BOOK OF DEAD', category: 'Slots', img: 'https://images.unsplash.com/photo-1601662528567-526cd06f6582?w=400' },
  { title: 'GATES OF OLYMPUS', category: 'Slots', img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' },
  { title: 'ROULETTE', category: 'Live Casino', img: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=400' },
  { title: 'BLACKJACK', category: 'Live Casino', img: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=400' },
  { title: 'SPORTS', category: 'Sports', img: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400' },
]

const FeaturedGames = () => (
  <section className="featured-games">
    <h2 className="section-title">FEATURED GAMES</h2>
    <div className="games-grid">
      {GAMES.map((game) => (
        <div key={game.title} className="game-card">
          <div className="game-image" style={{ backgroundImage: `url(${game.img})` }} />
          <div className="game-info">
            <div>
              <h3>{game.title}</h3>
              <p>{game.category}</p>
            </div>
            <button className="game-btn">→</button>
          </div>
        </div>
      ))}
    </div>
  </section>
)

export default FeaturedGames
