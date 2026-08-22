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
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
