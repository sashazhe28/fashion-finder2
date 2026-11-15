#!/usr/bin/env bash
# One-time setup of auto-update on the server (run as root from /opt/fashionfinder/deploy).
set -euo pipefail
cd "$(dirname "$0")"
id ffbuild >/dev/null 2>&1 || useradd --system --home-dir /var/lib/ffbuild --shell /usr/sbin/nologin ffbuild
install -d -o ffbuild -g ffbuild -m 750 /var/lib/ffbuild
install -d -o root -g root -m 700 /var/lib/ffautodeploy
install -m 755 -o root -g root autodeploy.sh /usr/local/sbin/fashionfinder-autodeploy
install -m 644 fashionfinder-autodeploy.service fashionfinder-autodeploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now fashionfinder-autodeploy.timer
echo "auto-update installed; logs: journalctl -u fashionfinder-autodeploy"
