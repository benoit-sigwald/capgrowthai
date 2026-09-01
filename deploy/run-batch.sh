#!/usr/bin/env bash
# Conteneur des traitements periodiques de CapGrowthAI.
#
# Aucun label Traefik : il n'a pas de porte sur Internet. Il ne detient que
# ses identifiants Oracle, lus depuis /root/ (convention ACCES-OCI.md).
set -euo pipefail
NAME=capgrowth-batch

ORA_PASSWORD=$(sudo cat /root/.ora_prospects)
ORA_WALLET_PASSWORD=$(sudo cat /root/.ora_wallet_password)

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network coolify --restart unless-stopped \
  -v /home/ubuntu/ora-wallet:/wallet:ro \
  -e ORA_USER=prospects \
  -e ORA_PASSWORD="$ORA_PASSWORD" \
  -e ORA_CONNECT=arxdb01_low \
  -e ORA_WALLET_DIR=/wallet \
  -e ORA_WALLET_PASSWORD="$ORA_WALLET_PASSWORD" \
  capgrowth-batch:latest
echo "capgrowth-batch lance"
