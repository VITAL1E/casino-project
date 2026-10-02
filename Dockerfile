# syntax=docker/dockerfile:1
# Two images from one file:
#   docker build --target server -t stack-server .   the game / API server
#   docker build --target web    -t stack-web    .   the static site + HTTPS reverse proxy (Caddy)
# See docker-compose.prod.yml and README.md.

# ---------- server ----------
FROM node:22-alpine AS server-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev -w server

FROM node:22-alpine AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
# the server runs the same game engines the browser previews with (they live in the client tree)
COPY client/src/games ./client/src/games
RUN mkdir -p server/data && chown -R node:node server/data
WORKDIR /app/server
USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://localhost:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["../node_modules/.bin/tsx", "index.ts"]

# ---------- web ----------
FROM node:22-alpine AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci -w client
COPY client ./client
# empty = same origin: the proxy forwards /api and /ws to the server
ENV VITE_API_URL=""
ARG SITE_URL=""
RUN SITE_URL="$SITE_URL" npm run build -w client

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=client-build /app/client/dist /srv
