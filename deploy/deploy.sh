#!/usr/bin/env bash
# Reconstruire et relancer depuis le depot GitHub — a executer sur la VM.
set -euo pipefail
cd /home/ubuntu/capgrowth-src
git pull --ff-only
docker build -t capgrowth:latest .
docker build -t capgrowth-batch:latest -f Dockerfile.batch .
bash deploy/run.sh
bash deploy/run-batch.sh
sleep 6
docker exec capgrowth node -e "fetch('http://127.0.0.1:3000/capgrowth/api/sante').then(r=>{if(!r.ok)process.exit(1);console.log('sante ok')}).catch(()=>process.exit(1))"
docker exec capgrowth-batch node -e "require('oracledb');console.log('batch: driver oracle ok')"
echo "deploiement verifie"
