#!/bin/sh
# Run by the official nginx image's entrypoint before nginx starts. Launches
# the Jam server in the background (restarting it if it ever exits); nginx
# proxies /jam-api/ to it. It inherits NAVIDROME_URL from the container env.
set -eu

(
  while true; do
    node /opt/jam/jam.mjs || true
    echo "[jam] server exited, restarting in 2s" >&2
    sleep 2
  done
) &
