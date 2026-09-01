#!/usr/bin/env bash
# Reconstruire et relancer depuis le depot GitHub — a executer sur la VM.
set -euo pipefail
cd /home/ubuntu/capgrowth-src
git pull --ff-only
docker build -t capgrowth:latest .
bash deploy/run.sh
sleep 6
docker exec capgrowth node -e "fetch('http://127.0.0.1:3000/capgrowth/api/sante').then(r=>{if(!r.ok)process.exit(1);console.log('sante ok')}).catch(()=>process.exit(1))"
echo "deploiement verifie"
