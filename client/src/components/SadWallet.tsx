// Sad snap-wallet with cash poking out of the top, gazing up at the Login/Register buttons above it and
// asking if you are sure. Colors come from CSS variables (see .hero-wallet in App.css).
const SadWallet = () => (
  <div className="hero-wallet" role="img" aria-label="A sad wallet with cash sticking out, looking up at the login buttons and asking: You sure, boss?">
    <svg className="hero-wallet-icon" viewBox="0 0 80 72" width="72" height="65" aria-hidden="true">
      {/* cash peeking out of the top, drawn behind the wallet */}
      <g transform="rotate(-7 30 16)">
        <rect className="hw-bill hw-bill--back" x="17" y="3" width="28" height="18" rx="2.5" />
        <circle className="hw-bill-mark" cx="31" cy="12" r="4.2" />
      </g>
      <g transform="rotate(6 52 16)">
        <rect className="hw-bill" x="38" y="1" width="28" height="18" rx="2.5" />
        <circle className="hw-bill-mark" cx="52" cy="10" r="4.2" />
        <path className="hw-bill-dollar" d="M52 7.6 V12.4 M53.6 8.8 Q52 7.6 50.6 8.6 Q50 9.8 52 10 Q54 10.2 53.4 11.4 Q52 12.6 50.4 11.2" />
      </g>
      <rect className="hw-body" x="6" y="14" width="68" height="50" rx="10" />
      <path className="hw-stitch" d="M16 59 H64" />
      <path className="hw-flap" d="M6 24 Q6 14 16 14 H64 Q74 14 74 24 V31 Q74 41 64 41 H16 Q6 41 6 31 Z" />
      {/* snap button doubles as the nose */}
      <circle className="hw-snap" cx="40" cy="41" r="4.5" />
      {/* sad brows, wide eyes with pupils looking up toward the buttons */}
      <path className="hw-brow" d="M18 22 L31 18 M49 18 L62 22" />
      <circle className="hw-sclera" cx="26" cy="31" r="7" />
      <circle className="hw-sclera" cx="54" cy="31" r="7" />
      <circle className="hw-pupil" cx="28.4" cy="28.4" r="3.3" />
      <circle className="hw-pupil" cx="56.4" cy="28.4" r="3.3" />
      <path className="hw-tear" d="M60 40 C57.6 43.6 57.2 45.4 60 46 C62.8 45.4 62.4 43.6 60 40 Z" />
      <path className="hw-mouth" d="M30 56 Q40 49 50 56" />
    </svg>
    <p className="hero-wallet-bubble">You sure, boss?</p>
  </div>
)

export default SadWallet
