#!/usr/bin/env bash
# CapGrowthAI — conteneur manuel (modele arx-linki/arx-mailer). Secrets depuis
# /root/, convention ACCES-OCI.md : jamais en dur ici. Le wallet est monte en
# lecture seule depuis /home/ubuntu/ora-wallet, comme pour arx-mailer.
set -euo pipefail
NAME=capgrowth

ORA_PASSWORD=$(sudo cat /root/.ora_prospects)
ORA_WALLET_PASSWORD=$(sudo cat /root/.ora_wallet_password)
if ! sudo test -s /root/.capgrowth_secret; then
  openssl rand -base64 32 | sudo tee /root/.capgrowth_secret >/dev/null
  sudo chmod 600 /root/.capgrowth_secret
fi
SECRET=$(sudo cat /root/.capgrowth_secret)
MAILER_SECRET=$(sudo cat /root/.mailer_secret)
# Retouche des gabarits par un modele de langue. Absente, le bouton le dit et
# l'ecran reste utilisable : ce n'est pas une dependance de l'envoi.
MISTRAL_API_KEY=$(sudo cat /root/.mistral_api_key 2>/dev/null || true)

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network coolify --restart unless-stopped \
  -v /home/ubuntu/ora-wallet:/wallet:ro \
  -e ORA_USER=prospects \
  -e ORA_PASSWORD="$ORA_PASSWORD" \
  -e ORA_CONNECT=arxdb01_low \
  -e ORA_WALLET_DIR=/wallet \
  -e ORA_WALLET_PASSWORD="$ORA_WALLET_PASSWORD" \
  -e NEXTAUTH_SECRET="$SECRET" \
  -e NEXTAUTH_URL=https://arx-consulting.com/capgrowth \
  -e HOSTNAME=0.0.0.0   -e MAILER_BASE=http://arx-mailer:8080   -e MAILER_SECRET="$MAILER_SECRET" \
  -e MISTRAL_API_KEY="$MISTRAL_API_KEY" \
  -l traefik.enable=true \
  -l 'traefik.http.routers.capgrowth-http.rule=Host(`arx-consulting.com`) && PathPrefix(`/capgrowth`)' \
  -l traefik.http.routers.capgrowth-http.entrypoints=http \
  -l traefik.http.routers.capgrowth-http.middlewares=redirect-to-https@file \
  -l traefik.http.routers.capgrowth-http.priority=1000 \
  -l 'traefik.http.routers.capgrowth-https.rule=Host(`arx-consulting.com`) && PathPrefix(`/capgrowth`)' \
  -l traefik.http.routers.capgrowth-https.entrypoints=https \
  -l traefik.http.routers.capgrowth-https.tls=true \
  -l traefik.http.routers.capgrowth-https.tls.certresolver=letsencrypt \
  -l traefik.http.routers.capgrowth-https.priority=1000 \
  -l traefik.http.services.capgrowth.loadbalancer.server.port=3000 \
  capgrowth:latest
echo "capgrowth lance"
