# syntax=docker/dockerfile:1

# ---- deps & build -----------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# ---- runtime ------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Default so the image still starts (and fails loudly in the logs) if
# NAVIDROME_URL isn't supplied; override it via docker-compose/.env.
ENV NAVIDROME_URL="https://navidrome.sachaguerin.fr"

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
