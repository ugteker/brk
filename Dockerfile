# All-in-one ChatTrader image: API (Fastify/Prisma/SQLite), the built SPA
# served by nginx, and cloudflared, running as sibling processes in a single
# container (see deploy/entrypoint.sh for the rationale/trade-offs and
# deploy/README.md for the overall architecture). Build from the repo root:
#   docker build -f Dockerfile .
#
# NOTE: apps/api's NODE_EXTRA_CA_CERTS / certs/netskope-root-ca.pem are only
# needed on the author's corporate-proxied dev machine and are intentionally
# not referenced here.

FROM node:20-alpine AS api-build
WORKDIR /app/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci
COPY apps/api/prisma ./prisma
RUN npx prisma generate
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/src ./src
# tsc is run here purely as a build-time type-check gate (fails the image
# build on type errors). The compiled dist/ output is intentionally NOT used
# at runtime: apps/api is an ESM package whose source imports omit the
# ".js" extension Node's ESM loader requires for compiled output, so the
# app is run straight from source via tsx at runtime instead (see the
# runtime stage below and apps/api/package.json's own "start"/"dev"
# scripts, which do the same).
RUN npm run build

FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ .
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache nginx bash
WORKDIR /app

# ---- API runtime ----
# Run from source via tsx (same as apps/api's own "start"/"dev" scripts),
# not the compiled dist/ output — see the api-build stage comment above.
COPY --from=api-build /app/api/node_modules ./api/node_modules
COPY --from=api-build /app/api/prisma ./api/prisma
COPY apps/api/src ./api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./api/
COPY apps/api/package.json apps/api/package-lock.json ./api/
# SQLite db file lives here at runtime; mount a volume at this path in
# compose so data survives container recreation.
VOLUME ["/app/api/prisma"]

# ---- Web static assets ----
COPY --from=web-build /app/web/dist /usr/share/nginx/html

# ---- nginx (static SPA + reverse proxy to the API on 127.0.0.1:3000) ----
COPY deploy/nginx.conf /etc/nginx/http.d/default.conf

# ---- cloudflared (binary lifted straight from Cloudflare's own image) ----
COPY --from=cloudflare/cloudflared:latest /usr/local/bin/cloudflared /usr/local/bin/cloudflared

COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
