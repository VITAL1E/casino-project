const PROMOS = [
  {
    title: 'HIT THE FLOOR.',
    subtitle: 'REAL ODDS. REAL ACTION.',
    cta: 'BET NOW',
    type: 'sports',
    tagline: 'REAL PLAYERS.\nREAL WINS.',
  },
  {
    title: 'STACK THE ODDS.',
    subtitle: 'HIGH LIMITS. BIGGER MOVES.',
    cta: 'EXPLORE GAMES',
    type: 'table-games',
  },
  {
    title: 'YOUR RULES.',
    subtitle: 'Faster. Smoother. Meaner.\nNo soft play. No limits.',
    cta: 'CREATE ACCOUNT',
    type: 'account',
    tagline: 'PLAY HARDER.',
  },
]

const PromoCards = () => (
  <section className="promo-cards">
    {PROMOS.map((promo) => (
      <div key={promo.type} className={`promo-card ${promo.type}`}>
        {promo.tagline && <p className="promo-tagline">{promo.tagline}</p>}
        <h2 className="promo-title">{promo.title}</h2>
        <p className="promo-subtitle">{promo.subtitle}</p>
        <button className="btn-primary">
          {promo.cta} <span>→</span>
        </button>
      </div>
    ))}
  </section>
)

export default PromoCards
