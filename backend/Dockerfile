FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
# `npm install` rather than `npm ci`: npm's lockfile handling for optional
# platform-specific native bindings (e.g. jest's unrs-resolver wasm32-wasi
# fallback) is inconsistent across host platforms, so a lockfile generated on
# macOS can fail npm ci's strict validation inside a Linux container even
# though the actual dependency versions are unaffected.
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
# Prune devDependencies out of the already-resolved node_modules instead of
# re-running `npm ci --omit=dev` in the runtime stage: a second independent
# resolution can hit npm's known flakiness around optional platform-specific
# packages (e.g. @emnapi/*), which don't affect a plain prune.
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# postgresql-client provides pg_dump/pg_restore, used by the backup feature.
# Version pinned to match the postgres:16-alpine service in docker-compose.yml.
RUN apk add --no-cache postgresql16-client
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
# `prisma/seed.ts` imports straight from `src/` and is run via ts-node
# (`npx prisma db seed`), not from the compiled dist output, so the
# TypeScript sources need to be present at runtime too.
COPY src ./src
RUN mkdir -p /app/uploads /app/backup-tmp && chown -R node:node /app/uploads /app/backup-tmp
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
