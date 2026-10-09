# syntax=docker/dockerfile:1

# ---- deps & build -----------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# ---- runtime ------------------------------------------------------------
# The unprivileged nginx variant runs as uid 101 and keeps its pid/temp files
# in /tmp, so the container works under Kubernetes' "restricted" Pod Security
# Standard (runAsNonRoot, no privilege escalation, all capabilities dropped).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Default so the image still starts (and fails loudly in the logs) if
# NAVIDROME_URL isn't supplied; override it via docker-compose/.env or the
# Kubernetes Deployment.
ENV NAVIDROME_URL="https://navidrome.sachaguerin.fr"

# Node runs the Jam server (shared listening sessions) next to nginx.
USER root
RUN apk add --no-cache nodejs
USER 101

COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/40-start-jam-server.sh /docker-entrypoint.d/40-start-jam-server.sh
COPY server/jam.mjs /opt/jam/jam.mjs
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# Docker-only; Kubernetes ignores HEALTHCHECK and uses the probes in
# deploy/k8s/deployment.yaml instead. /jam-api/healthz goes through nginx to
# the Jam server, so it checks both processes.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD wget -qO- http://127.0.0.1:8080/jam-api/healthz >/dev/null 2>&1 || exit 1
