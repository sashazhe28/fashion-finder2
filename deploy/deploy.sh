#!/usr/bin/env bash
# Build locally and upload to the server. Usage:
#   SERVER=root@1.2.3.4 SSH_KEY=~/.ssh/key ./deploy/deploy.sh
# Requires .env.production.local with VITE_* values for the frontend build (public keys only).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SERVER:?set SERVER=root@host}"
SSH_KEY=${SSH_KEY:-$HOME/.ssh/id_ed25519}
APP_DIR=/opt/fashionfinder
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new"

rm -rf dist dist-server
npm run build

# Safety: no server secrets in the browser bundle
if grep -lE "AIza[0-9A-Za-z_-]{35}|sk_(live|test)_|YOOKASSA_SECRET|live_[A-Za-z0-9]{20,}" dist/assets/*.js >/dev/null 2>&1; then
  echo "Secret-looking string found in dist/, aborting" >&2
  exit 1
fi

rsync -az --delete -e "$SSH" dist/ "$SERVER:$APP_DIR/dist/"
rsync -az --delete -e "$SSH" dist-server/ "$SERVER:$APP_DIR/dist-server/"
rsync -az -e "$SSH" package.json package-lock.json .env.example "$SERVER:$APP_DIR/"
rsync -az --delete -e "$SSH" deploy/ "$SERVER:$APP_DIR/deploy/"

$SSH "$SERVER" "set -e; cd $APP_DIR; PATH=$APP_DIR/node/bin:\$PATH npm ci --omit=dev --no-audit --no-fund --loglevel=error;
  install -m 644 deploy/fashionfinder.service /etc/systemd/system/fashionfinder.service;
  systemctl daemon-reload; systemctl enable fashionfinder >/dev/null 2>&1; systemctl restart fashionfinder;
  sleep 2; systemctl is-active fashionfinder; curl -fsS http://127.0.0.1:\$(grep -E '^PORT=' .env | cut -d= -f2 || echo 3000)/api/health"
echo
echo "deployed to $SERVER"
