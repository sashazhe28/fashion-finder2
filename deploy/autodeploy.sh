#!/usr/bin/env bash
# Auto-update from GitHub. Runs on the server as root from a systemd timer
# (see fashionfinder-autodeploy.timer). Every run:
#   1. fetches the main branch of the public repository;
#   2. if there is a new commit, builds it as the unprivileged user "ffbuild"
#      (no access to .env, only the public VITE_* values are passed in);
#   3. switches the site and checks /api/health; if anything fails, the previous
#      version stays (or is restored) and the commit is not retried.
# Logs: journalctl -u fashionfinder-autodeploy
# A failed commit is not retried; push a fix, or retry with: rm /var/lib/ffautodeploy/failed
#
# Installed as /usr/local/sbin/fashionfinder-autodeploy (root-owned copy, so a push to
# the repository cannot change this script itself).
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/sashazhe28/fashion-finder2.git}
BRANCH=${BRANCH:-main}
APP_DIR=/opt/fashionfinder
SERVICE=fashionfinder
BUILD_USER=ffbuild
WORK=/var/lib/ffbuild            # owned by ffbuild: repo clone + build dir
STATE=/var/lib/ffautodeploy      # owned by root: deployed/failed commit, backup
NODE_BIN=$APP_DIR/node/bin

log() { echo "[autodeploy] $*"; }
as_builder() { setpriv --reuid="$BUILD_USER" --regid="$BUILD_USER" --init-groups env -i HOME="$WORK" PATH="$NODE_BIN:/usr/bin:/bin" "$@"; }

mkdir -p "$STATE"
exec 9>"$STATE/lock"
flock -n 9 || { log "previous run still in progress"; exit 0; }

# 1. Fetch
if [ ! -d "$WORK/repo/.git" ]; then
  as_builder git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$WORK/repo"
fi
as_builder git -C "$WORK/repo" remote set-url origin "$REPO_URL"
as_builder git -C "$WORK/repo" fetch --quiet --force origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
SHA=$(as_builder git -C "$WORK/repo" rev-parse "origin/$BRANCH")
SHORT=${SHA:0:7}

[ "$SHA" = "$(cat "$STATE/deployed" 2>/dev/null)" ] && exit 0
[ "$SHA" = "$(cat "$STATE/failed" 2>/dev/null)" ] && exit 0

fail() { log "commit $SHORT NOT deployed: $*"; echo "$SHA" > "$STATE/failed"; exit 0; }

# 2. Guards: never publish a version without the server part or with Gemini in the browser
as_builder git -C "$WORK/repo" cat-file -e "$SHA:server/index.ts" 2>/dev/null \
  || fail "no server/ folder in $BRANCH (old AI Studio version?), site left as is"
if as_builder git -C "$WORK/repo" grep -q -e "@google/genai" "$SHA" -- src index.html \
   || as_builder git -C "$WORK/repo" grep -q -e "process.env.GEMINI_API_KEY" -e "process.env.API_KEY" "$SHA" -- vite.config.ts src; then
  fail "frontend calls Gemini directly (key would go to the browser), site left as is"
fi

# 3. Build as ffbuild with only the public VITE_* values
log "building $SHORT"
B="$WORK/build"
as_builder rm -rf "$B"
as_builder mkdir -p "$B"
as_builder sh -c "git -C '$WORK/repo' archive '$SHA' | tar -x -C '$B'"

VITE_ENV=()
while IFS= read -r line; do VITE_ENV+=("$line"); done < <(grep -E '^VITE_[A-Z0-9_]+=' "$APP_DIR/.env" || true)

T="timeout 15m"
cd "$B"
rm -f "$STATE/new-modules"
$T setpriv --reuid="$BUILD_USER" --regid="$BUILD_USER" --init-groups env -i HOME="$WORK" PATH="$NODE_BIN:/usr/bin:/bin" \
  npm ci --no-audit --no-fund --loglevel=error || fail "npm ci failed, site left as is"
$T setpriv --reuid="$BUILD_USER" --regid="$BUILD_USER" --init-groups env -i HOME="$WORK" PATH="$NODE_BIN:/usr/bin:/bin" NODE_ENV=production "${VITE_ENV[@]}" \
  npm run build || fail "build failed, site left as is"
if grep -lE "AIza[0-9A-Za-z_-]{35}|sk_(live|test)_|YOOKASSA_SECRET|(^|[^A-Za-z0-9_])live_[A-Za-z0-9_-]{20,}" dist/assets/*.js >/dev/null 2>&1; then
  fail "secret-looking string in the browser bundle, site left as is"
fi
[ -f dist/index.html ] && [ -f dist-server/index.mjs ] || fail "build output missing, site left as is"
# Production dependencies, also installed as ffbuild, only when the lock file changed
if ! cmp -s package-lock.json "$APP_DIR/package-lock.json"; then
  as_builder rm -rf node_modules
  $T setpriv --reuid="$BUILD_USER" --regid="$BUILD_USER" --init-groups env -i HOME="$WORK" PATH="$NODE_BIN:/usr/bin:/bin" \
    npm ci --omit=dev --no-audit --no-fund --loglevel=error || fail "npm ci --omit=dev failed, site left as is"
  touch "$STATE/new-modules"
fi
cd /

# 4. Switch, keeping a copy of the current version
log "switching to $SHORT"
mkdir -p "$STATE/prev"
rsync -a --delete "$APP_DIR/dist/" "$STATE/prev/dist/"
rsync -a --delete "$APP_DIR/dist-server/" "$STATE/prev/dist-server/"
cp -a "$APP_DIR/package.json" "$APP_DIR/package-lock.json" "$STATE/prev/"
[ -f "$STATE/new-modules" ] && rsync -a --delete "$APP_DIR/node_modules/" "$STATE/prev/node_modules/"

C="--chown=root:root"
rsync -a --delete $C "$B/dist/" "$APP_DIR/dist/"
rsync -a --delete $C "$B/dist-server/" "$APP_DIR/dist-server/"
rsync -a $C "$B/package.json" "$B/package-lock.json" "$APP_DIR/"
[ -f "$STATE/new-modules" ] && rsync -a --delete $C "$B/node_modules/" "$APP_DIR/node_modules/"

PORT=$(grep -E '^PORT=' "$APP_DIR/.env" | cut -d= -f2 || true); PORT=${PORT:-3000}
healthy() {
  systemctl restart "$SERVICE"
  for _ in $(seq 1 15); do
    sleep 2
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
  done
  return 1
}

if healthy; then
  echo "$SHA" > "$STATE/deployed"
  log "deployed $SHORT"
else
  log "health check failed, restoring the previous version"
  rsync -a --delete "$STATE/prev/dist/" "$APP_DIR/dist/"
  rsync -a --delete "$STATE/prev/dist-server/" "$APP_DIR/dist-server/"
  cp -a "$STATE/prev/package.json" "$STATE/prev/package-lock.json" "$APP_DIR/"
  [ -f "$STATE/new-modules" ] && rsync -a --delete "$STATE/prev/node_modules/" "$APP_DIR/node_modules/"
  healthy && log "previous version restored" || log "WARNING: previous version also fails health check"
  fail "new version did not start"
fi
