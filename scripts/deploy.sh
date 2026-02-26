#!/usr/bin/env bash
set -euo pipefail

ROOT=${ROOT:-/opt/pulzz-hotupdate}
APP_DIR="$ROOT/app"

mkdir -p "$APP_DIR"
rsync -a --delete app/ "$APP_DIR/"

cd "$APP_DIR"
npm install --omit=dev

if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.js --update-env
else
  echo "pm2 not found; start manually: node src/server.js"
fi
