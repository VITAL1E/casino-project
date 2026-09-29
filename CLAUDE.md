# Rules

- Be maximally concise. No filler, no preamble, no trailing summaries.
- Short answers only. One sentence per update when working.
- No pleasantries, no "Great!", no "Sure!".
- Skip explanations unless asked.
- No bullet lists when a single line suffices.
- Code only, no prose around it unless asked.

# TypeScript style

- Follow the Google TypeScript Style Guide: https://google.github.io/styleguide/tsguide.html

# Security

- Apply OWASP security principles to all code, not just auth/server code: https://devguide.owasp.org/en/02-foundations/03-security-principles/
- In particular: minimize attack surface, secure defaults, least privilege, defense in depth, fail securely (don't leak info in errors), never trust client input, keep security mechanisms simple, no security-by-obscurity.

# Stack

- React 19 + TypeScript + Vite
- CSS custom properties only (no Tailwind, no CSS modules)
- Icons: lucide-react
- Font: Manrope (Google Fonts)
- Dev server: localhost:5173

# Theme

- bg: `#0c1220`, nav/sidebar: `#0e1826`
- accent blue: `#4f9cf9` (bright: `#7db8fb`, dim: `#2563eb`)
- yellow CTA: `#facc15`
- surface: `#111928` / `#162035` / `#1c2a42`
- text-mid: `#8899b8`, text-dim: `#4a5878`
- CSS vars in `:root` — always use them, never hardcode colors

# Layout

- `--nav-h: 68px` fixed top nav, `--sidebar-w: 60px` fixed left sidebar, `--bottom-h: 44px` fixed bottom bar
- Main content: `padding-left: var(--sidebar-w)` — sidebar is already accounted for
- Horizontal content margins: `48px` left/right (hero, games section, live wins)

# File map

- `client/` — frontend (Vite root, its own `package.json`)
- `server/` — backend (Express + TS, its own `package.json`; run from `server/`, imports `../client/src/games/*` for shared game-replay logic)
- `server/db/schema.ts` — Drizzle ORM schema, source of truth for the DB shape; `npm run db:generate` diffs it into a new `server/drizzle/*.sql` migration, applied automatically on server boot
- DB access goes through Drizzle (`db`/`schema` from `server/db`) — no raw SQL strings; use `.for('update')` + `db.transaction()` for anything touching wallet balances
- `client/src/App.css` — all styles (single file)
- `client/src/components/Layout.tsx` — nav + sidebar shell, chat widget + cookie banner
- `client/src/components/LiveWinsTable.tsx` — horizontal live wins strip
- `client/src/pages/Home.tsx` — hero, live wins, game grid
- `client/src/components/HeroSection.tsx` — hero

# Efficiency rules

- Read App.css before editing it — it's one big file, sections are comment-labeled
- Always read a file before editing to get exact strings (avoids "string not found")
- When editing CSS, target the specific rule block by its comment header
- Playwright MCP available for browser testing after session restart
- `! <cmd>` runs shell commands in the Claude Code terminal session
