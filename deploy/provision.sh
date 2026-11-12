#!/usr/bin/env bash
# One-time server setup (Ubuntu 22.04/24.04). Run as root on the server:
#   bash provision.sh
# Idempotent: safe to run again.
set -euo pipefail

APP_DIR=/opt/fashionfinder
NODE_V=${NODE_V:-v22.23.5}
export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx ufw curl xz-utils rsync

# App user and folders
id fashionfinder >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin fashionfinder
mkdir -p "$APP_DIR/data"
chown -R fashionfinder:fashionfinder "$APP_DIR/data"

# Own Node.js for the app (system Node is not touched)
if [ ! -x "$APP_DIR/node/bin/node" ] || [ "$("$APP_DIR/node/bin/node" -v)" != "$NODE_V" ]; then
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/node.tar.xz" "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-x64.tar.xz"
  expected=$(curl -fsSL "https://nodejs.org/dist/$NODE_V/SHASUMS256.txt" | awk -v f="node-$NODE_V-linux-x64.tar.xz" '$2==f{print $1}')
  echo "$expected  $tmp/node.tar.xz" | sha256sum -c -
  rm -rf "$APP_DIR/node" && mkdir -p "$APP_DIR/node"
  tar -xJf "$tmp/node.tar.xz" -C "$APP_DIR/node" --strip-components=1
  rm -rf "$tmp"
fi

# 1 GB swap: npm on a 1 GB RAM server
if ! swapon --show | grep -q '^/swapfile'; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Firewall: only SSH and HTTP(S) from outside; the app listens on 127.0.0.1
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Remove nginx default site (this server is only for the app)
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "provision done: node $("$APP_DIR/node/bin/node" -v)"
