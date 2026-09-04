# CapGrowth AI — Autonomous B2B Prospecting & Investor CRM Platform

Next.js 16 + TypeScript platform powered by **Oracle Autonomous Database 23ai** (`PROSPECTS` schema) and **Mistral AI**, dedicated to targeted private equity, venture capital, and regional enterprise outreach.

---

## 🚀 Key Features

- **Decider & Fund Database:** Over 81,000 deciders and 68,000 investment funds/companies indexed with automated RNE & contact verification.
- **AI-Powered Outreach:** Personalized pitch generation and custom copywriting using `mistral-small` and `mistral-large`.
- **Vector Search Ready:** Native Oracle 23ai `VECTOR(1024, FLOAT32)` support for semantic investment thesis matching.
- **Transactional & Batch Engines:** Multi-channel cold emailing, domain warming, and engagement tracking via Arx Tracker.

---

## 🛠️ Stack & Architecture

- **Frontend:** Next.js (App Router / Pages), React 19, Tailwind CSS.
- **Backend / APIs:** Next.js API Routes, Oracle Database 23ai Client (`oracledb`).
- **AI Models:** Mistral AI API (`mistral-small-latest`, `mistral-embed`).
- **Deployment:** Self-hosted Docker container managed via Coolify on OCI Ampere ARM64.

---

## ⚙️ Environment Variables

Required environment configuration in `.env`:
```bash
ORA_USER=prospects
ORA_PASSWORD=******
ORA_CONNECT=arxdb01_low
ORA_WALLET_DIR=/path/to/ora-wallet
MISTRAL_API_KEY=******
```

---

## 📄 License

Proprietary CRM software.
