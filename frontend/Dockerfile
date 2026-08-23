FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# `npm install` rather than `npm ci`: see backend/Dockerfile for why (optional
# platform-specific native binding packages resolve inconsistently between
# the macOS host that generates the lockfile and this Linux build container).
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# openssl CLI (not present by default) is used by
# docker-entrypoint.d/10-self-signed-cert.sh to generate a fallback HTTPS
# certificate on first start.
RUN apk add --no-cache openssl
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-locations.conf /etc/nginx/locations.conf
COPY docker-entrypoint.d/10-self-signed-cert.sh /docker-entrypoint.d/10-self-signed-cert.sh
RUN chmod +x /docker-entrypoint.d/10-self-signed-cert.sh
EXPOSE 80 443
