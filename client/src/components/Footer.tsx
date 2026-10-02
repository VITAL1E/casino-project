import { Link } from 'react-router-dom'

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Casino',
    links: [
      { label: 'Casino Home', to: '/casino' },
      { label: 'Slots', to: '/casino?group=slots' },
      { label: 'Live Casino', to: '/casino?group=live' },
      { label: 'Arcades', to: '/casino?group=arcade' },
      { label: 'Classics', to: '/casino?group=classics' },
    ],
  },
  {
    title: 'Sports',
    links: [
      { label: 'Sportsbook', to: '/sports' },
      { label: 'Live Betting', to: '/sports?live=1' },
      { label: 'Football', to: '/sports?sport=football' },
      { label: 'Basketball', to: '/sports?sport=basketball' },
      { label: 'Baseball', to: '/sports?sport=baseball' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Cookie Policy', to: '/cookies' },
      { label: 'Responsible Gambling', to: '/responsible-gambling' },
      { label: 'AML Policy', to: '/aml' },
      { label: 'Fairness', to: '/fairness' },
    ],
  },
  {
    title: 'Rewards',
    links: [
      { label: 'VIP Club', to: '/vip' },
      { label: 'Promotions', to: '/promotions' },
      { label: 'Challenges', to: '/challenges' },
      { label: 'Affiliates', to: '/affiliates' },
      { label: 'Blog', to: '/blog' },
    ],
  },
  {
    title: 'About Us',
    links: [
      { label: 'About STACK', to: '/about' },
      { label: 'Help Center', to: '/help' },
      { label: 'Contact Us', to: '/contact' },
      { label: 'Careers', to: '/careers' },
    ],
  },
]

const Footer = () => (
  <footer className="site-footer">
    <div className="footer-cols">
      {COLUMNS.map(col => (
        <div key={col.title} className="footer-col">
          <h2 className="footer-col-title">{col.title}</h2>
          {col.links.map(l => (
            <Link key={l.label} to={l.to} className="footer-link">{l.label}</Link>
          ))}
        </div>
      ))}
    </div>

    <div className="footer-bottom">
      <span className="footer-logo">STACK</span>
      <p className="footer-legal">
        © {new Date().getFullYear()} STACK. All rights reserved. Gambling involves risk — play responsibly. 18+ only.
      </p>
    </div>
  </footer>
)

export default Footer
