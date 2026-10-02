# Repository Guidelines

## Project Structure & Module Organization
This play-money casino uses npm workspaces: `client/` (React 19, TypeScript, Vite) and `server/` (Express, WebSockets, PostgreSQL, Drizzle).
- `client/src/components/` and `pages/`: shared UI and routes; `games/`: game views and networking; `lib/`: API clients; `assets/`: bundled images; `client/public/`: static assets.
- `server/arcade/`, `classics/`, `sports/`, and `rewards/`: gameplay and settlement services. Authentication lives in `server/auth/`.
- `server/db/schema.ts`: database schema; `server/drizzle/`: generated migrations; `server/tests/`: tests.
- `deploy/` and Compose files: deployment; `.github/workflows/ci.yml`: CI.

## Build, Test, and Development Commands
Run commands from the repository root. Use Node.js 22, matching CI.
- `npm ci`: install locked workspace dependencies.
- `npm run db:up`: start local PostgreSQL through Docker Compose.
- Copy `server/.env.example` to `server/.env`, then run `npm run server:dev`: start the API on port 8787; migrations run on boot.
- `npm run dev`: start Vite on port 5173 in a separate terminal.
- `npm run build`: typecheck, build, and prerender the client.
- `npm run lint`: run client ESLint checks.
- `npm run typecheck -w server`: check server TypeScript.
- `npm test -w server`: run Vitest tests.
- `npm run db:generate`: generate migrations after schema changes.

## Coding Style & Naming Conventions
Use two-space indentation, single quotes, and omitted statement semicolons. Use PascalCase component filenames (`PageShell.tsx`), camelCase functions and variables, and `use` prefixes for hooks. Follow the Google TypeScript style guidance in `CLAUDE.md`. ESLint checks TypeScript, React Hooks, and Fast Refresh; no dedicated formatter is configured. Use CSS custom properties for theme colors and styles in `App.css`; read its labeled sections before editing.

## Testing Guidelines
Place Vitest tests in `server/tests/<feature>.test.ts` with descriptive `describe`/`it` cases. Database tests require local PostgreSQL via `DATABASE_URL`; they create and clean up temporary users. Cover wallet idempotency, concurrent updates, settlement, and gameplay regressions when changing those paths. No numeric coverage threshold is configured. Run tests, server typechecking, client lint, and client build before submitting.

## Commit & Pull Request Guidelines
History uses descriptive subjects, such as `Remove dead Slither round and replay code`; no enforced prefix convention is evident. Keep commits focused. PRs should explain changes, link issues, report checks, and include screenshots for UI changes. Document migrations and configuration changes.

## Security & Configuration
Keep secrets out of Git; use the provided environment examples. Validate client inputs and keep outcomes server-authoritative. Route every balance change through `server/wallet.ts` to preserve atomic transactions, idempotency, and ledger auditing. Keep this project explicitly play-money.
