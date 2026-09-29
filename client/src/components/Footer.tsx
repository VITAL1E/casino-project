import { Link } from 'react-router-dom'

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Casino',
    links: [
      { label: 'Casino Home', to: '/casino' },
      { label: 'Slots', to: '/casino?group=slots' },
      { label: 'Live Casino', to: '/casino?group=live' },
      { label: 'Originals', to: '/casino?group=originals' },
      { label: 'Table Games', to: '/casino?group=table' },
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
      { label: 'Terms of Service', to: '#' },
      { label: 'Privacy Policy', to: '#' },
      { label: 'Responsible Gambling', to: '#' },
      { label: 'AML Policy', to: '#' },
      { label: 'Fairness', to: '#' },
    ],
  },
  {
    title: 'Rewards',
    links: [
      { label: 'VIP Club', to: '#' },
      { label: 'Rakeback', to: '#' },
      { label: 'Promotions', to: '#' },
      { label: 'Affiliates', to: '#' },
    ],
  },
  {
    title: 'About Us',
    links: [
      { label: 'About STACK', to: '#' },
      { label: 'Help Center', to: '#' },
      { label: 'Contact Us', to: '#' },
      { label: 'Careers', to: '#' },
    ],
  },
]

const Footer = () => (
  <footer className="site-footer">
    <div className="footer-cols">
      {COLUMNS.map(col => (
        <div key={col.title} className="footer-col">
          <h4 className="footer-col-title">{col.title}</h4>
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
