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
COPY apps/api/package.json apps/api/package-lock.json ./api/
RUN npm ci --omit=dev --prefix ./api
COPY --from=api-build /app/api/node_modules/.prisma ./api/node_modules/.prisma
COPY --from=api-build /app/api/node_modules/@prisma ./api/node_modules/@prisma
COPY --from=api-build /app/api/dist ./api/dist
COPY apps/api/prisma ./api/prisma
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
