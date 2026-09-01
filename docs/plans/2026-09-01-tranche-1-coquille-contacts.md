# CapGrowthAI — Tranche 1 (coquille + Contacts) — Plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'application CapGrowthAI (Next.js, multi-mandat) avec sa navigation complète à la Brevo et la section Contacts entière, branchée sur le référentiel Oracle existant.

**Architecture:** Next.js Pages Router (miroir de Linki, déjà en service sur le serveur), API routes connectées au schéma Oracle `PROSPECTS` via le driver thin `oracledb`. Le cloisonnement par mandat est posé côté serveur (`lib/portee.ts`) — l'écran n'écrit jamais de requête libre. L'écriture d'un champ de contact va dans la table source (résolue par le préfixe de `PERSON_KEY`) avec trace `source=manuel` dans `ENRICHISSEMENT`.

**Tech Stack:** Next.js 16.1.6, React 19.2.3, next-auth 4.24 (credentials + bcryptjs), oracledb ^6.9 (thin, wallet B64), papaparse, vitest. Déploiement : conteneur manuel + labels Traefik (modèle arx-linki), `https://arx-consulting.com/capgrowth`.

## Global Constraints

- **21 sessions Oracle max pour tout le parc** : `poolMax: 4`, un seul pool par processus.
- **Aucun secret dans le dépôt** : les secrets vivent dans `/root/.…` sur la VM (convention ACCES-OCI.md).
- Le rôle `client` n'accède **pas** à la section Contacts (le référentiel est l'actif d'Arx).
- `CLIENT_ID` sur segments/listes/attributs — **jamais** sur les personnes.
- Import et suppression de contact : **rôle admin uniquement** ; suppression refusée (409) si `MAILING_SENDS` référence le contact.
- Sections non praticables (SMS, WhatsApp, Conversations) : **grisées avec motif**, jamais absentes ni factices.
- Texte UI et commentaires en français ; identifiants de code en français (style maison).
- Accès serveur : `ssh -i ~/.ssh/oci-work.key ubuntu@145.241.174.15`. SQL admin : conteneur gate `qdj4xiwdvltpui9zjjgrm2zy-*` (`AP="$(sudo cat /root/.ora_admin)"`).
- Base path obligatoire : `/capgrowth` (pas de strip Traefik — le basePath Next le porte).

---

### Task 1: Squelette du dépôt

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`
- Create: `styles/global.css`, `pages/_app.tsx`, `pages/index.tsx`, `pages/api/sante.ts`
- Create: `.gitignore`, `vitest.config.ts`

**Interfaces:**
- Produces: projet Next.js compilable, route `GET /capgrowth/api/sante` → `{ ok: true }`, `npm test` (vitest) opérationnel.

- [ ] **Step 1: Initialiser le dépôt et les fichiers de base**

`package.json` :
```json
{
  "name": "capgrowthai",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "adm-zip": "^0.5.16",
    "bcryptjs": "^3.0.3",
    "next": "16.1.6",
    "next-auth": "^4.24.13",
    "oracledb": "^6.9.0",
    "papaparse": "^5.5.3",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.7",
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.0.0",
    "@types/papaparse": "^5.3.15",
    "@types/react": "^19.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

`next.config.ts` :
```ts
import type { NextConfig } from "next";

// basePath obligatoire : l'app est servie sous arx-consulting.com/capgrowth et
// Traefik ne retire PAS le prefixe (un strip casserait les assets /_next).
const config: NextConfig = {
  basePath: "/capgrowth",
  output: "standalone",
  // oracledb est un module natif CJS : il ne doit pas etre empaquete par le
  // bundler, sinon le build echoue sur les binaires.
  serverExternalPackages: ["oracledb", "adm-zip"],
};
export default config;
```

`tsconfig.json` :
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

`vitest.config.ts` :
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

`.gitignore` :
```
node_modules/
.next/
.env
*.tsbuildinfo
```

`styles/global.css` — le système visuel d'apple.com, repris de l'outil précédent (pile SF, #F5F5F7, #0071E3, pilules 980px) :
```css
:root{
  --bg:#FFFFFF; --bg-alt:#F5F5F7; --card:#FFFFFF;
  --ink:#1D1D1F; --ink-2:#6E6E73; --ink-3:#86868B;
  --hair:#D2D2D7; --hair-soft:#E8E8ED;
  --blue:#0071E3; --ok:#248A3D; --warn:#B25000; --crit:#D70015;
  --r:18px; --pill:980px; --shadow:0 4px 24px rgba(0,0,0,.06);
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#000; --bg-alt:#101012; --card:#1D1D1F;
    --ink:#F5F5F7; --ink-2:#A1A1A6; --ink-3:#86868B;
    --hair:#38383D; --hair-soft:#2A2A2E; --blue:#2997FF;
    --ok:#30D158; --warn:#FF9F0A; --crit:#FF453A;
    --shadow:0 4px 24px rgba(0,0,0,.5);
  }
}
*{box-sizing:border-box}
html{-webkit-font-smoothing:antialiased}
body{margin:0; background:var(--bg); color:var(--ink); font-size:12px; line-height:1.45;
  letter-spacing:-.012em;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif}
h1,h2,h3{margin:0; font-weight:600; letter-spacing:-.022em}
a{color:var(--blue); text-decoration:none}
button{font:inherit}
input,select,textarea{font:inherit; color:var(--ink); background:var(--card);
  border:1px solid var(--hair); border-radius:11px; padding:8px 12px}
input:focus,select:focus{outline:none; border-color:var(--blue);
  box-shadow:0 0 0 4px color-mix(in srgb,var(--blue) 20%,transparent)}
.pill{display:inline-block; font-size:10px; padding:2px 9px; border-radius:var(--pill);
  background:var(--bg-alt); color:var(--ink-2)}
.pill.ok{background:color-mix(in srgb,var(--ok) 14%,transparent); color:var(--ok)}
.pill.warn{background:color-mix(in srgb,var(--warn) 14%,transparent); color:var(--warn)}
.pill.crit{background:color-mix(in srgb,var(--crit) 14%,transparent); color:var(--crit)}
.btn{cursor:pointer; border:1px solid var(--hair); background:var(--card); color:var(--ink);
  border-radius:var(--pill); padding:8px 16px; font-size:11px}
.btn.bleu{background:var(--blue); border-color:var(--blue); color:#fff}
```

`pages/_app.tsx` :
```tsx
import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import "@/styles/global.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session} basePath="/capgrowth/api/auth">
      <Component {...pageProps} />
    </SessionProvider>
  );
}
```

`pages/index.tsx` (provisoire — remplacé en Task 5) :
```tsx
export default function Accueil() {
  return <main style={{ padding: 40 }}><h1>CapGrowthAI</h1></main>;
}
```

`pages/api/sante.ts` :
```ts
import type { NextApiRequest, NextApiResponse } from "next";
// Route publique (exclue du middleware) : elle sert au conteneur et a Traefik
// pour savoir si l'app repond, pas a exposer quoi que ce soit.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.json({ ok: true, app: "capgrowthai" });
}
```

- [ ] **Step 2: Installer et compiler**

Run: `cd "G:/My Drive/Dev/capgrowthai" && git init -b master && npm install && npm run build`
Expected: build Next.js sans erreur (`✓ Compiled`).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Squelette Next.js : basePath /capgrowth, theme, sante"
```

---

### Task 2: Connexion Oracle (`lib/oracle.ts`)

**Files:**
- Create: `lib/oracle.ts`

**Interfaces:**
- Produces: `q(sql, binds?, opts?)`, `qLot(sql, lignes, bindDefs)`, `fermer()` — mêmes contrats que `arx-prospects/lib/oracle.js`, en TypeScript.

- [ ] **Step 1: Écrire le module**

`lib/oracle.ts` :
```ts
import fs from "fs";
import path from "path";
import oracledb from "oracledb";

// Portage TypeScript de arx-prospects/lib/oracle.js — memes decisions :
// wallet extrait de ORA_WALLET_B64, pool unique et bas (21 sessions pour tout
// le parc Always Free), fermeture explicite pour les scripts.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.fetchAsString = [oracledb.CLOB];

const WALLET_DIR = process.env.ORA_WALLET_DIR || "/tmp/wallet";

if (process.env.ORA_WALLET_B64 && !fs.existsSync(path.join(WALLET_DIR, "tnsnames.ora"))) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AdmZip = require("adm-zip");
  fs.mkdirSync(WALLET_DIR, { recursive: true });
  new AdmZip(Buffer.from(process.env.ORA_WALLET_B64, "base64")).extractAllTo(WALLET_DIR, true);
}

let _pool: oracledb.Pool | null = null;

async function pool(): Promise<oracledb.Pool> {
  if (!_pool) {
    _pool = await oracledb.createPool({
      user: process.env.ORA_USER,
      password: process.env.ORA_PASSWORD,
      connectString: process.env.ORA_CONNECT,
      configDir: WALLET_DIR,
      walletLocation: WALLET_DIR,
      walletPassword: process.env.ORA_WALLET_PASSWORD,
      poolMin: 0, poolMax: 4, poolTimeout: 120,
    });
  }
  return _pool;
}

export async function q(sql: string, binds: oracledb.BindParameters = {},
                        opts: oracledb.ExecuteOptions = {}) {
  const c = await (await pool()).getConnection();
  try { return await c.execute(sql, binds, { autoCommit: true, ...opts }); }
  finally { await c.close(); }
}

export async function qLot(sql: string, lignes: Record<string, unknown>[],
                           bindDefs: Record<string, oracledb.BindDefinition>) {
  if (!lignes.length) return { rowsAffected: 0 };
  const c = await (await pool()).getConnection();
  try { return await c.executeMany(sql, lignes, { autoCommit: true, bindDefs }); }
  finally { await c.close(); }
}

export async function fermer() {
  if (_pool) { await _pool.close(0); _pool = null; }
}

export { oracledb };
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npm run build`
Expected: build sans erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/oracle.ts && git commit -m "Connexion Oracle : pool unique, wallet B64, ecriture par lots"
```

---

### Task 3: Socle Oracle — mandats, comptes, droits

**Files:**
- Create: `scripts/creer-socle.js` (CommonJS : il tourne dans le conteneur gate, pas dans Next)

**Interfaces:**
- Produces (tables du schéma `PROSPECTS`) : `CLIENT(ID, NOM, MODE_EXPEDITEUR, CREATED_AT)`, `UTILISATEUR(ID, EMAIL, NOM, HASH, ROLE, ACTIF, CREATED_AT)`, `AFFECTATION(UTILISATEUR_ID, CLIENT_ID)`, `CONTACT_LISTE(ID, CLIENT_ID, NOM, NOTES, CREATED_AT)`, `CONTACT_LISTE_MEMBRE(LISTE_ID, PERSON_KEY, AJOUTE_LE)`, `ATTRIBUT_LIBRE(ID, CLIENT_ID, NOM, TYPE)`, `ATTRIBUT_VALEUR(ATTRIBUT_ID, PERSON_KEY, VALEUR, MAJ_LE)`. `LISTE` gagne `CLIENT_ID` (unicité `(CLIENT_ID, NOM)`). Droits `UPDATE/INSERT/DELETE` vers les tables sources.

- [ ] **Step 1: Écrire le script (simulation par défaut, `--appliquer` pour écrire)**

`scripts/creer-socle.js` :
```js
'use strict';
/*
 * Socle multi-mandat de CapGrowthAI. En ADMIN (les GRANT l'exigent), objets
 * crees chez PROSPECTS via CURRENT_SCHEMA. Rejouable : chaque objet n'est
 * cree que s'il manque.
 *
 *   sudo docker cp creer-socle.js <gate>:/app/
 *   sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" \
 *     -e ADMIN_EMAIL=... -e ADMIN_HASH='<bcrypt>' <gate> node creer-socle.js --appliquer
 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
const APPLIQUER = process.argv.includes('--appliquer');

const TABLES = {
  CLIENT: `CREATE TABLE CLIENT (
    ID NUMBER GENERATED ALWAYS AS IDENTITY,
    NOM VARCHAR2(160) NOT NULL,
    -- Choisi par l'admin a la creation du mandat : adresses communes, ou
    -- chaque utilisateur envoie sous la sienne (tranche 2).
    MODE_EXPEDITEUR VARCHAR2(12) DEFAULT 'mandat' NOT NULL,
    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_CLIENT PRIMARY KEY (ID),
    CONSTRAINT UQ_CLIENT_NOM UNIQUE (NOM),
    CONSTRAINT CK_CLIENT_MODE CHECK (MODE_EXPEDITEUR IN ('mandat','utilisateur')))`,
  UTILISATEUR: `CREATE TABLE UTILISATEUR (
    ID NUMBER GENERATED ALWAYS AS IDENTITY,
    EMAIL VARCHAR2(320) NOT NULL,
    NOM VARCHAR2(160),
    HASH VARCHAR2(100) NOT NULL,
    ROLE VARCHAR2(10) NOT NULL,
    ACTIF NUMBER(1) DEFAULT 1 NOT NULL,
    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_UTILISATEUR PRIMARY KEY (ID),
    CONSTRAINT UQ_UTILISATEUR_EMAIL UNIQUE (EMAIL),
    CONSTRAINT CK_UTILISATEUR_ROLE CHECK (ROLE IN ('admin','membre','client')))`,
  AFFECTATION: `CREATE TABLE AFFECTATION (
    UTILISATEUR_ID NUMBER NOT NULL REFERENCES UTILISATEUR(ID) ON DELETE CASCADE,
    CLIENT_ID NUMBER NOT NULL REFERENCES CLIENT(ID) ON DELETE CASCADE,
    CONSTRAINT PK_AFFECTATION PRIMARY KEY (UTILISATEUR_ID, CLIENT_ID))`,
  CONTACT_LISTE: `CREATE TABLE CONTACT_LISTE (
    ID NUMBER GENERATED ALWAYS AS IDENTITY,
    CLIENT_ID NUMBER NOT NULL REFERENCES CLIENT(ID),
    NOM VARCHAR2(160) NOT NULL,
    NOTES VARCHAR2(1000),
    CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_CONTACT_LISTE PRIMARY KEY (ID),
    CONSTRAINT UQ_CONTACT_LISTE UNIQUE (CLIENT_ID, NOM))`,
  CONTACT_LISTE_MEMBRE: `CREATE TABLE CONTACT_LISTE_MEMBRE (
    LISTE_ID NUMBER NOT NULL REFERENCES CONTACT_LISTE(ID) ON DELETE CASCADE,
    PERSON_KEY VARCHAR2(620) NOT NULL,
    AJOUTE_LE TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_CL_MEMBRE PRIMARY KEY (LISTE_ID, PERSON_KEY))`,
  ATTRIBUT_LIBRE: `CREATE TABLE ATTRIBUT_LIBRE (
    ID NUMBER GENERATED ALWAYS AS IDENTITY,
    CLIENT_ID NUMBER NOT NULL REFERENCES CLIENT(ID),
    NOM VARCHAR2(60) NOT NULL,
    TYPE VARCHAR2(10) DEFAULT 'texte' NOT NULL,
    CONSTRAINT PK_ATTRIBUT PRIMARY KEY (ID),
    CONSTRAINT UQ_ATTRIBUT UNIQUE (CLIENT_ID, NOM),
    CONSTRAINT CK_ATTRIBUT_TYPE CHECK (TYPE IN ('texte','nombre','date')))`,
  ATTRIBUT_VALEUR: `CREATE TABLE ATTRIBUT_VALEUR (
    ATTRIBUT_ID NUMBER NOT NULL REFERENCES ATTRIBUT_LIBRE(ID) ON DELETE CASCADE,
    PERSON_KEY VARCHAR2(620) NOT NULL,
    VALEUR VARCHAR2(1000),
    MAJ_LE TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_ATTR_VALEUR PRIMARY KEY (ATTRIBUT_ID, PERSON_KEY))`,
};

async function main() {
  const cn = await oracledb.getConnection({
    user: 'ADMIN', password: process.env.AP,
    connectString: process.env.ORA_CONNECT,
    configDir: '/tmp/wallet', walletLocation: '/tmp/wallet',
    walletPassword: process.env.ORA_WALLET_PASSWORD,
  });
  const q = (sql, b = {}) => cn.execute(sql, b, { autoCommit: true });
  await q(`ALTER SESSION SET CURRENT_SCHEMA = PROSPECTS`);

  const existe = async n => (await q(
    `SELECT COUNT(*) N FROM ALL_TABLES WHERE OWNER='PROSPECTS' AND TABLE_NAME=:n`,
    { n })).rows[0].N > 0;
  const colExiste = async (t, c) => (await q(
    `SELECT COUNT(*) N FROM ALL_TAB_COLUMNS WHERE OWNER='PROSPECTS' AND TABLE_NAME=:t AND COLUMN_NAME=:c`,
    { t, c })).rows[0].N > 0;

  // L'ecriture a la source exige des droits que la lecture n'avait pas.
  const gates = (await q(`SELECT OWNER FROM ALL_TABLES
      WHERE TABLE_NAME='PROSPECTS' AND OWNER LIKE 'GATE\\_%' ESCAPE '\\' ORDER BY OWNER`))
    .rows.map(r => r.OWNER);
  const grants = [
    `GRANT UPDATE, INSERT, DELETE ON INVESTORS.CONTACTS TO PROSPECTS`,
    `GRANT DELETE ON INVESTORS.DEMARCHAGE TO PROSPECTS`,
    ...gates.map(g => `GRANT UPDATE, DELETE ON ${g}.PROSPECTS TO PROSPECTS`),
  ];

  const etapes = [];
  for (const [nom, ddl] of Object.entries(TABLES)) {
    if (!(await existe(nom))) etapes.push([`table ${nom}`, ddl]);
  }
  if (!(await colExiste('LISTE', 'CLIENT_ID'))) {
    etapes.push(['colonne LISTE.CLIENT_ID',
      `ALTER TABLE LISTE ADD (CLIENT_ID NUMBER REFERENCES CLIENT(ID))`]);
    // L'unicite du nom devient par mandat : deux mandats peuvent nommer leurs
    // segments pareil sans se voir.
    etapes.push(['unicite LISTE', `ALTER TABLE LISTE DROP CONSTRAINT UQ_LISTE_NOM`]);
    etapes.push(['unicite LISTE', `ALTER TABLE LISTE ADD CONSTRAINT UQ_LISTE_CLIENT_NOM UNIQUE (CLIENT_ID, NOM)`]);
  }
  etapes.push(...grants.map(g => ['grant', g]));

  if (!APPLIQUER) {
    etapes.forEach(([t, sql]) => console.log(`-- ${t}\n${sql};\n`));
    console.log('-- simulation. Relancer avec --appliquer.');
    await cn.close(); return;
  }
  for (const [t, sql] of etapes) { await q(sql); console.log(`  ok ${t}`); }

  // Amorcage : le premier mandat et le compte admin. Idempotent par MERGE.
  await q(`MERGE INTO CLIENT c USING (SELECT 'Innovat Property' NOM FROM DUAL) s
           ON (c.NOM = s.NOM)
           WHEN NOT MATCHED THEN INSERT (NOM, MODE_EXPEDITEUR) VALUES (s.NOM, 'mandat')`);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_HASH) {
    await q(`MERGE INTO UTILISATEUR u USING (SELECT :e EMAIL FROM DUAL) s
             ON (LOWER(u.EMAIL) = LOWER(s.EMAIL))
             WHEN MATCHED THEN UPDATE SET HASH = :h
             WHEN NOT MATCHED THEN INSERT (EMAIL, NOM, HASH, ROLE)
               VALUES (:e, 'Benoit', :h, 'admin')`,
          { e: process.env.ADMIN_EMAIL, h: process.env.ADMIN_HASH });
  }
  const v = await q(`SELECT (SELECT COUNT(*) FROM CLIENT) CLIENTS,
                            (SELECT COUNT(*) FROM UTILISATEUR) UTILISATEURS FROM DUAL`);
  console.log(`  verif : ${v.rows[0].CLIENTS} client(s), ${v.rows[0].UTILISATEURS} utilisateur(s)`);
  await cn.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Simulation sur le serveur**

```bash
scp -i ~/.ssh/oci-work.key scripts/creer-socle.js ubuntu@145.241.174.15:/tmp/
ssh -i ~/.ssh/oci-work.key ubuntu@145.241.174.15 'G=$(sudo docker ps --format "{{.Names}}" | grep ^qdj4xiwd); sudo docker cp /tmp/creer-socle.js $G:/app/; sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" $G node creer-socle.js'
```
Expected: le DDL listé, `-- simulation`, aucune erreur.

- [ ] **Step 3: Générer le hash admin puis appliquer**

```bash
ssh -i ~/.ssh/oci-work.key ubuntu@145.241.174.15 'L=arx-linki; H=$(sudo docker exec $L node -e "console.log(require(\"bcryptjs\").hashSync(process.argv[1],10))" "$(openssl rand -base64 18)"); echo "MOT DE PASSE INITIAL A TRANSMETTRE AU PROPRIETAIRE (le changer ensuite)"; G=$(sudo docker ps --format "{{.Names}}" | grep ^qdj4xiwd); sudo docker exec -w /app -e AP="$(sudo cat /root/.ora_admin)" -e ADMIN_EMAIL=benoit.p.g.sigwald@gmail.com -e ADMIN_HASH="$H" $G node creer-socle.js --appliquer'
```
Note d'exécution : générer le mot de passe en clair d'abord, le donner à l'utilisateur en fin de tâche, ne jamais l'écrire dans un fichier.
Expected: `ok table …` ×7, `ok grant` ×~37, `verif : 1 client(s), 1 utilisateur(s)`.

- [ ] **Step 4: Commit**

```bash
git add scripts/creer-socle.js && git commit -m "Socle Oracle : mandats, comptes, listes statiques, attributs, droits d'ecriture"
```

---

### Task 4: Portée multi-mandat (`lib/portee.ts`) — TDD

**Files:**
- Create: `lib/portee.ts`
- Test: `tests/portee.test.ts`

**Interfaces:**
- Produces: `type Portee = { uid: number; role: 'admin'|'membre'|'client'; clientIds: number[] }` ; `clientAutorise(p, clientId): boolean` ; `contactsAutorises(p): boolean` ; `exigerAdmin(p): boolean`.
- Consumed by: toutes les API (Tasks 6–11).

- [ ] **Step 1: Écrire les tests (échec attendu)**

`tests/portee.test.ts` :
```ts
import { describe, it, expect } from "vitest";
import { clientAutorise, contactsAutorises, exigerAdmin, Portee } from "../lib/portee";

const admin: Portee = { uid: 1, role: "admin", clientIds: [] };
const membre: Portee = { uid: 2, role: "membre", clientIds: [1, 3] };
const client: Portee = { uid: 3, role: "client", clientIds: [2] };

describe("clientAutorise", () => {
  it("admin voit tous les mandats", () => expect(clientAutorise(admin, 42)).toBe(true));
  it("membre voit ses mandats affectes", () => {
    expect(clientAutorise(membre, 1)).toBe(true);
    expect(clientAutorise(membre, 2)).toBe(false);
  });
  it("client ne voit que le sien", () => {
    expect(clientAutorise(client, 2)).toBe(true);
    expect(clientAutorise(client, 1)).toBe(false);
  });
});

describe("contactsAutorises", () => {
  it("le referentiel est l'actif d'Arx : le role client n'y accede pas", () => {
    expect(contactsAutorises(admin)).toBe(true);
    expect(contactsAutorises(membre)).toBe(true);
    expect(contactsAutorises(client)).toBe(false);
  });
});

describe("exigerAdmin", () => {
  it("seul admin passe", () => {
    expect(exigerAdmin(admin)).toBe(true);
    expect(exigerAdmin(membre)).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test` — Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter**

`lib/portee.ts` :
```ts
/*
 * La portee d'un utilisateur : qui il est, ce qu'il a le droit de voir.
 *
 * Toute API scoped passe par ici. C'est la couche que l'ecran ne peut pas
 * contourner : le filtre par mandat est decide dans le serveur, jamais dans
 * une requete construite cote navigateur.
 */
export type Role = "admin" | "membre" | "client";
export interface Portee { uid: number; role: Role; clientIds: number[] }

export function clientAutorise(p: Portee, clientId: number): boolean {
  if (p.role === "admin") return true;
  return p.clientIds.includes(clientId);
}

// Le referentiel (85 494 personnes) est l'actif d'Arx, pas celui d'un mandat.
export function contactsAutorises(p: Portee): boolean {
  return p.role !== "client";
}

export function exigerAdmin(p: Portee): boolean {
  return p.role === "admin";
}
```

- [ ] **Step 4: Vérifier le succès** — Run: `npm test` — Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/portee.ts tests/portee.test.ts && git commit -m "Portee multi-mandat : le filtre vit cote serveur"
```

---

### Task 5: Authentification et coquille

**Files:**
- Create: `lib/auth.ts`, `pages/api/auth/[...nextauth].ts`, `middleware.ts`, `pages/connexion.tsx`
- Create: `components/Coquille.tsx`, `lib/mandat.tsx`
- Create: `pages/api/mes-mandats.ts`
- Modify: `pages/index.tsx`

**Interfaces:**
- Consumes: `q` (Task 2), tables `UTILISATEUR`/`AFFECTATION`/`CLIENT` (Task 3), `Portee` (Task 4).
- Produces: `porteeDepuis(req, res): Promise<Portee | null>` (dans `lib/auth.ts`) — utilisée par toutes les API suivantes ; `<Coquille section="contacts">…</Coquille>` ; contexte mandat `useMandat()` → `{ mandat, mandats, choisir }`.

- [ ] **Step 1: `lib/auth.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { q } from "./oracle";
import type { Portee, Role } from "./portee";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/connexion" },
  providers: [
    CredentialsProvider({
      name: "Identifiants",
      credentials: { email: { type: "text" }, motdepasse: { type: "password" } },
      async authorize(cred) {
        if (!cred?.email || !cred?.motdepasse) return null;
        const r = await q(
          `SELECT ID, EMAIL, NOM, HASH, ROLE FROM UTILISATEUR
            WHERE LOWER(EMAIL) = LOWER(:e) AND ACTIF = 1`, { e: cred.email });
        const u = r.rows?.[0] as { ID: number; EMAIL: string; NOM: string; HASH: string; ROLE: Role } | undefined;
        if (!u || !bcrypt.compareSync(cred.motdepasse, u.HASH)) return null;
        // Les affectations entrent dans le jeton a la connexion. Une nouvelle
        // affectation prend effet a la reconnexion — compromis assume en v1.
        const a = await q(`SELECT CLIENT_ID FROM AFFECTATION WHERE UTILISATEUR_ID = :id`, { id: u.ID });
        const clientIds = (a.rows as { CLIENT_ID: number }[]).map(x => x.CLIENT_ID);
        return { id: String(u.ID), email: u.EMAIL, name: u.NOM,
                 role: u.ROLE, clientIds } as never;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) { const u = user as never as { role: Role; clientIds: number[] };
        token.role = u.role; token.clientIds = u.clientIds; }
      return token;
    },
    session({ session, token }) {
      (session as never as { portee: Portee }).portee = {
        uid: Number(token.sub), role: token.role as Role,
        clientIds: (token.clientIds as number[]) || [],
      };
      return session;
    },
  },
};

export async function porteeDepuis(req: NextApiRequest, res: NextApiResponse): Promise<Portee | null> {
  const s = await getServerSession(req, res, authOptions);
  return (s as never as { portee?: Portee })?.portee ?? null;
}
```

- [ ] **Step 2: `pages/api/auth/[...nextauth].ts`**

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
export default NextAuth(authOptions);
```

- [ ] **Step 3: `middleware.ts`**

```ts
import { withAuth } from "next-auth/middleware";

// Tout est prive sauf la connexion, la sante et la mecanique next-auth.
export default withAuth({ pages: { signIn: "/connexion" } });
export const config = {
  matcher: ["/((?!api/auth|api/sante|connexion|_next|favicon.ico).*)"],
};
```

- [ ] **Step 4: `pages/connexion.tsx`**

```tsx
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";

export default function Connexion() {
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState("");
  const routeur = useRouter();

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const r = await signIn("credentials", { redirect: false, email, motdepasse: mdp });
    if (r?.ok) routeur.push("/");
    else setErreur("Identifiants refusés.");
  }
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-alt)" }}>
      <form onSubmit={envoyer} style={{ background: "var(--card)", borderRadius: "var(--r)",
        boxShadow: "var(--shadow)", padding: 36, width: 340, display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>CapGrowthAI</h1>
        <input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <input placeholder="Mot de passe" type="password" value={mdp} onChange={e => setMdp(e.target.value)} />
        <button className="btn bleu" type="submit">Se connecter</button>
        {erreur && <span style={{ color: "var(--crit)", fontSize: 11 }}>{erreur}</span>}
      </form>
    </main>
  );
}
```

- [ ] **Step 5: `pages/api/mes-mandats.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  const sql = p.role === "admin"
    ? `SELECT ID, NOM, MODE_EXPEDITEUR FROM CLIENT ORDER BY NOM`
    : `SELECT c.ID, c.NOM, c.MODE_EXPEDITEUR FROM CLIENT c
        JOIN AFFECTATION a ON a.CLIENT_ID = c.ID AND a.UTILISATEUR_ID = :uid
        ORDER BY c.NOM`;
  const r = await q(sql, p.role === "admin" ? {} : { uid: p.uid });
  res.json({ role: p.role, mandats: r.rows });
}
```

- [ ] **Step 6: `lib/mandat.tsx` (contexte du mandat actif)**

```tsx
import { createContext, useContext, useEffect, useState } from "react";

type Mandat = { ID: number; NOM: string; MODE_EXPEDITEUR: string };
type Ctx = { mandat: Mandat | null; mandats: Mandat[]; role: string; choisir: (m: Mandat) => void };
const MandatCtx = createContext<Ctx>({ mandat: null, mandats: [], role: "", choisir: () => {} });

export function MandatFournisseur({ children }: { children: React.ReactNode }) {
  const [mandats, setMandats] = useState<Mandat[]>([]);
  const [role, setRole] = useState("");
  const [mandat, setMandat] = useState<Mandat | null>(null);

  useEffect(() => {
    fetch("/capgrowth/api/mes-mandats").then(r => r.json()).then(d => {
      setMandats(d.mandats || []); setRole(d.role || "");
      // Le dernier mandat choisi est un confort local, jamais une verite.
      let voulu: Mandat | undefined;
      try { const id = Number(localStorage.getItem("mandat")); voulu = d.mandats.find((m: Mandat) => m.ID === id); } catch {}
      setMandat(voulu ?? d.mandats[0] ?? null);
    }).catch(() => {});
  }, []);

  const choisir = (m: Mandat) => { setMandat(m); try { localStorage.setItem("mandat", String(m.ID)); } catch {} };
  return <MandatCtx.Provider value={{ mandat, mandats, role, choisir }}>{children}</MandatCtx.Provider>;
}
export const useMandat = () => useContext(MandatCtx);
```

- [ ] **Step 7: `components/Coquille.tsx` — la barre latérale complète**

```tsx
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useMandat } from "@/lib/mandat";

/*
 * La navigation entiere, dans l'ordre de Brevo. Les sections a venir sont
 * grisees avec leur tranche ; les canaux non praticables portent leur motif.
 * Jamais de trompe-l'oeil : un menu qui promet un canal inaccessible fait
 * perdre plus de temps qu'il n'en fait gagner.
 */
const SECTIONS: { id: string; libelle: string; etat: "actif" | "a_venir" | "indisponible"; motif?: string }[] = [
  { id: "", libelle: "Tableau de bord", etat: "a_venir", motif: "tranche 2" },
  { id: "contacts", libelle: "Contacts", etat: "actif" },
  { id: "campagnes", libelle: "Campagnes", etat: "a_venir", motif: "tranche 2" },
  { id: "automatisation", libelle: "Automatisation", etat: "a_venir", motif: "tranche 5" },
  { id: "modeles", libelle: "Modèles", etat: "a_venir", motif: "tranche 5" },
  { id: "statistiques", libelle: "Statistiques", etat: "a_venir", motif: "tranche 5" },
  { id: "transactionnel", libelle: "Transactionnel", etat: "a_venir", motif: "tranche 5" },
  { id: "crm", libelle: "CRM", etat: "a_venir", motif: "tranche 3" },
  { id: "sms", libelle: "SMS", etat: "indisponible", motif: "Aucun crédit SMS Brevo" },
  { id: "whatsapp", libelle: "WhatsApp", etat: "indisponible", motif: "Pas de compte WhatsApp Business" },
  { id: "conversations", libelle: "Conversations", etat: "indisponible", motif: "Aucun widget de chat installé" },
  { id: "parametres", libelle: "Paramètres", etat: "a_venir", motif: "tranche 2" },
];

export default function Coquille({ section, children }: { section: string; children: React.ReactNode }) {
  const { mandat, mandats, choisir } = useMandat();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", minHeight: "100vh" }}>
      <aside style={{ background: "var(--bg-alt)", borderRight: "1px solid var(--hair-soft)",
        padding: "18px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 15, padding: "4px 10px 12px" }}>CapGrowthAI</div>
        <select value={mandat?.ID ?? ""} title="Mandat actif — porte le cloisonnement"
          onChange={e => { const m = mandats.find(x => x.ID === Number(e.target.value)); if (m) choisir(m); }}
          style={{ marginBottom: 14 }}>
          {mandats.map(m => <option key={m.ID} value={m.ID}>{m.NOM}</option>)}
        </select>
        {SECTIONS.map(s => s.etat === "actif" ? (
          <Link key={s.id} href={`/${s.id}`} style={{
            padding: "8px 10px", borderRadius: 10, color: "inherit",
            background: section === s.id ? "var(--card)" : "transparent",
            fontWeight: section === s.id ? 600 : 400 }}>{s.libelle}</Link>
        ) : (
          <span key={s.id} title={s.motif} style={{ padding: "8px 10px", color: "var(--ink-3)", cursor: "not-allowed" }}>
            {s.libelle} <small style={{ fontSize: 9 }}>{s.etat === "indisponible" ? "—" : "bientôt"}</small>
          </span>
        ))}
        <button className="btn" style={{ marginTop: "auto" }}
          onClick={() => signOut({ callbackUrl: "/capgrowth/connexion" })}>Se déconnecter</button>
      </aside>
      <main style={{ padding: "26px 32px", minWidth: 0 }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 8: `pages/index.tsx` (remplace le provisoire)**

```tsx
import Coquille from "@/components/Coquille";
import { MandatFournisseur } from "@/lib/mandat";

export default function Accueil() {
  return (
    <MandatFournisseur>
      <Coquille section="">
        <h1 style={{ fontSize: 22 }}>Tableau de bord</h1>
        <p style={{ color: "var(--ink-3)" }}>Arrive en tranche 2. La section Contacts est active.</p>
      </Coquille>
    </MandatFournisseur>
  );
}
```

- [ ] **Step 9: Compiler + tests** — Run: `npm run build && npm test` — Expected: build OK, 6 tests PASS.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "Authentification, portee en session, coquille et selecteur de mandat"
```

---

### Task 6: Requêtes personnes et écriture à la source (`lib/personnes.ts`) — TDD

**Files:**
- Create: `lib/personnes.ts`
- Test: `tests/personnes.test.ts`

**Interfaces:**
- Produces: `construireFiltre(params): { where: string; binds: Record<string, unknown> }` ; `resoudreSource(personKey): CibleEcriture | null` avec `type CibleEcriture = { table: string; cle: string; valeurCle: string | number; colonnes: Record<string, string> }` ; `CHAMPS_GENERIQUES: string[]`.
- Consumed by: Task 7 (API), Task 9 (segments — même `construireFiltre`).

- [ ] **Step 1: Tests (échec attendu)**

`tests/personnes.test.ts` :
```ts
import { describe, it, expect } from "vitest";
import { construireFiltre, resoudreSource } from "../lib/personnes";

describe("resoudreSource", () => {
  it("inv: vers INVESTORS.CONTACTS", () => {
    const c = resoudreSource("inv:jane@acme.com")!;
    expect(c.table).toBe("INVESTORS.CONTACTS");
    expect(c.cle).toBe("CONTACT_ID");
    expect(c.valeurCle).toBe("jane@acme.com");
    expect(c.colonnes.prenom).toBe("FIRST_NAME");
    expect(c.colonnes.societe).toBe("ORG_NAME");
  });
  it("pro: vers PROSPECTS.CONTACTS, cle numerique, societe non modifiable", () => {
    const c = resoudreSource("pro:1234")!;
    expect(c.table).toBe("PROSPECTS.CONTACTS");
    expect(c.valeurCle).toBe(1234);
    expect(c.colonnes.societe).toBeUndefined();
  });
  it("gate: resout le schema du site en majuscules", () => {
    const c = resoudreSource("gate:877:3")!;
    expect(c.table).toBe("GATE_877.PROSPECTS");
    expect(c.valeurCle).toBe(3);
  });
  it("gate: refuse un nom de site hors alphabet (garde injection)", () => {
    expect(resoudreSource("gate:877;DROP:3")).toBeNull();
  });
  it("dir: non modifiable (le dirigeant vit dans ENTREPRISES)", () => {
    expect(resoudreSource("dir:99")).toBeNull();
  });
});

describe("construireFiltre", () => {
  it("sans filtre : garde neutre", () => {
    const f = construireFiltre({});
    expect(f.where).toBe("1 = 1");
    expect(f.binds).toEqual({});
  });
  it("q cherche nom, societe, titre, e-mail — en bind, jamais en concat", () => {
    const f = construireFiltre({ q: "dupont" });
    expect(f.where).toContain("UPPER(FIRST_NAME");
    expect(f.binds.q).toBe("%DUPONT%");
    expect(f.where).not.toContain("dupont");
  });
  it("canal joignable", () => {
    const f = construireFiltre({ canal: "joignable" });
    expect(f.where).toContain("EMAIL IS NOT NULL OR LINKEDIN_URL IS NOT NULL");
  });
  it("source gate couvre les 35 schemas", () => {
    const f = construireFiltre({ source: "gate" });
    expect(f.where).toContain("SOURCE LIKE 'gate:%'");
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test` — Expected: FAIL.

- [ ] **Step 3: Implémenter**

`lib/personnes.ts` :
```ts
/*
 * Le referentiel : lecture de V_PERSONNES, et ecriture A LA SOURCE.
 *
 * Une personne editee a l'ecran est corrigee dans sa table d'origine, resolue
 * par le prefixe de PERSON_KEY. La vue reste une vue : ecrire dans une copie
 * creerait deux verites, et le prochain import ecraserait la saisie.
 */
export const CHAMPS_GENERIQUES = ["prenom", "nom", "titre", "societe", "email",
  "telephone", "linkedin", "ville", "pays", "notes"] as const;
export type ChampGenerique = (typeof CHAMPS_GENERIQUES)[number];

export interface CibleEcriture {
  table: string;
  cle: string;
  valeurCle: string | number;
  colonnes: Partial<Record<ChampGenerique, string>>;
}

export function resoudreSource(personKey: string): CibleEcriture | null {
  if (personKey.startsWith("inv:")) {
    return {
      table: "INVESTORS.CONTACTS", cle: "CONTACT_ID", valeurCle: personKey.slice(4),
      colonnes: { prenom: "FIRST_NAME", nom: "LAST_NAME", titre: "JOB_TITLE",
        societe: "ORG_NAME", email: "EMAIL", telephone: "PHONE",
        linkedin: "LINKEDIN_URL", ville: "CITY", pays: "COUNTRY", notes: "NOTES" },
    };
  }
  if (personKey.startsWith("pro:")) {
    const id = Number(personKey.slice(4));
    if (!Number.isInteger(id)) return null;
    // societe et pays viennent du rattachement a ENTREPRISES : pas modifiables ici.
    return {
      table: "PROSPECTS.CONTACTS", cle: "ID", valeurCle: id,
      colonnes: { prenom: "PRENOM", nom: "NOM", titre: "FONCTION", email: "EMAIL",
        telephone: "TELEPHONE", linkedin: "LINKEDIN_URL", ville: "LOCALISATION" },
    };
  }
  const gate = personKey.match(/^gate:([a-z0-9_]+):(\d+)$/);
  if (gate) {
    // Le nom du site vient de nos propres schemas, mais il entre dans un nom
    // de table : la regex stricte est la garde contre l'injection.
    return {
      table: `GATE_${gate[1].toUpperCase()}.PROSPECTS`, cle: "ID", valeurCle: Number(gate[2]),
      colonnes: { prenom: "FIRST_NAME", nom: "LAST_NAME", societe: "COMPANY",
        email: "EMAIL", telephone: "PHONE", ville: "CITY", pays: "COUNTRY", notes: "NOTES" },
    };
  }
  // dir: le nom vit dans ENTREPRISES.DIRIGEANT — l'editer ici reecrirait la
  // fiche entreprise. Motif rendu par l'API, pas d'ecriture.
  return null;
}

export function construireFiltre(p: Record<string, string | undefined>) {
  const w: string[] = [];
  const binds: Record<string, unknown> = {};
  if (p.q) {
    w.push(`(UPPER(FIRST_NAME || ' ' || LAST_NAME) LIKE :q
             OR UPPER(NVL(COMPANY,' ')) LIKE :q OR UPPER(NVL(TITLE,' ')) LIKE :q
             OR UPPER(NVL(EMAIL,' ')) LIKE :q)`);
    binds.q = `%${p.q.toUpperCase()}%`;
  }
  if (p.source) {
    if (p.source === "gate") w.push(`SOURCE LIKE 'gate:%'`);
    else { w.push(`SOURCE = :source`); binds.source = p.source; }
  }
  if (p.canal === "email") w.push(`EMAIL IS NOT NULL`);
  if (p.canal === "linkedin") w.push(`LINKEDIN_URL IS NOT NULL`);
  if (p.canal === "joignable") w.push(`(EMAIL IS NOT NULL OR LINKEDIN_URL IS NOT NULL)`);
  if (p.pays) { w.push(`UPPER(COUNTRY) = UPPER(:pays)`); binds.pays = p.pays; }
  if (p.territoire) { w.push(`TERRITOIRE = :territoire`); binds.territoire = p.territoire; }
  if (p.secteur) { w.push(`SECTEUR = :secteur`); binds.secteur = p.secteur; }
  if (p.optout === "1") w.push(`OPT_OUT = 1`);
  return { where: w.length ? w.join(" AND ") : "1 = 1", binds };
}
```

- [ ] **Step 4: Vérifier le succès** — Run: `npm test` — Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/personnes.ts tests/personnes.test.ts && git commit -m "Personnes : filtres en binds et resolution d'ecriture a la source"
```

---

### Task 7: API Contacts

**Files:**
- Create: `pages/api/personnes/index.ts`, `pages/api/personnes/[key].ts`, `pages/api/desinscrits.ts`

**Interfaces:**
- Consumes: `q` (T2), `porteeDepuis` (T5), `contactsAutorises`/`exigerAdmin` (T4), `construireFiltre`/`resoudreSource`/`CHAMPS_GENERIQUES` (T6).
- Produces: `GET /api/personnes?q&source&canal&pays&territoire&secteur&page` → `{ total, rows }` (60/page) ; `GET /api/personnes/<key>` → `{ fiche, organisation, frise, enrichissements, attributs }` ; `PATCH` `{ champ, valeur }` → écrit à la source + trace ; `DELETE` (admin) ; `GET /api/desinscrits` → `{ total, rows }`.

- [ ] **Step 1: `pages/api/personnes/index.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";
import { construireFiltre } from "@/lib/personnes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "le referentiel est reserve a Arx" });
  res.setHeader("Cache-Control", "no-store");

  const params = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v ?? "")]));
  const { where, binds } = construireFiltre(params);
  const off = Number(params.page || 0) * 60;

  const r = await q(`SELECT PERSON_KEY, SOURCE, FIRST_NAME, LAST_NAME, EMAIL, LINKEDIN_URL,
                            TITLE, COMPANY, CITY, COUNTRY, PHONE, TERRITOIRE, SECTEUR, OPT_OUT
                       FROM V_PERSONNES WHERE ${where}
                      ORDER BY LAST_NAME, FIRST_NAME
                      OFFSET :off ROWS FETCH NEXT 60 ROWS ONLY`, { ...binds, off });
  const c = await q(`SELECT COUNT(*) N FROM V_PERSONNES WHERE ${where}`, binds);
  res.json({ total: (c.rows as { N: number }[])[0].N, rows: r.rows });
}
```

- [ ] **Step 2: `pages/api/personnes/[key].ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises, exigerAdmin } from "@/lib/portee";
import { resoudreSource, CHAMPS_GENERIQUES, ChampGenerique } from "@/lib/personnes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "le referentiel est reserve a Arx" });
  res.setHeader("Cache-Control", "no-store");
  const k = String(req.query.key);

  if (req.method === "GET") {
    const f = await q(`SELECT * FROM V_PERSONNES WHERE PERSON_KEY = :k`, { k });
    if (!f.rows?.length) return res.status(404).json({ erreur: "personne inconnue" });
    const fiche = f.rows[0] as Record<string, unknown>;
    const clientId = Number(req.query.client || 0);
    const [org, frise, enr, attrs] = await Promise.all([
      fiche.ORG_KEY
        ? q(`SELECT * FROM V_ORGANISATIONS WHERE ORG_KEY = :o`, { o: fiche.ORG_KEY })
        : Promise.resolve({ rows: [] }),
      q(`SELECT i.QUAND, i.CANAL, i.TYPE, i.SENS, i.RESUME, i.ORIGINE, i.AUTEUR, c.NOM CAMPAGNE
           FROM INTERACTION i LEFT JOIN CAMPAGNE c ON c.ID = i.CAMPAGNE_ID
          WHERE i.PERSON_KEY = :k ORDER BY i.QUAND DESC`, { k }),
      // La provenance de chaque champ : qui a dit quoi, quand. C'est ce qui
      // permet a l'import de ne jamais ecraser une saisie humaine.
      q(`SELECT CHAMP, VALEUR, SOURCE, CONFIANCE, VU_LE FROM ENRICHISSEMENT
          WHERE CIBLE = :k ORDER BY VU_LE DESC`, { k }),
      clientId
        ? q(`SELECT a.ID, a.NOM, a.TYPE, v.VALEUR FROM ATTRIBUT_LIBRE a
              LEFT JOIN ATTRIBUT_VALEUR v ON v.ATTRIBUT_ID = a.ID AND v.PERSON_KEY = :k
             WHERE a.CLIENT_ID = :cid ORDER BY a.NOM`, { k, cid: clientId })
        : Promise.resolve({ rows: [] }),
    ]);
    return res.json({ fiche, organisation: org.rows?.[0] ?? null,
                      frise: frise.rows, enrichissements: enr.rows, attributs: attrs.rows });
  }

  if (req.method === "PATCH") {
    const { champ, valeur } = (req.body ?? {}) as { champ?: ChampGenerique; valeur?: string };
    if (!champ || !CHAMPS_GENERIQUES.includes(champ))
      return res.status(400).json({ erreur: `champ inconnu : ${champ}` });
    const cible = resoudreSource(k);
    if (!cible) return res.status(422).json({ erreur: "fiche non modifiable : le dirigeant se corrige sur la fiche entreprise" });
    const col = cible.colonnes[champ];
    if (!col) return res.status(422).json({ erreur: `« ${champ} » ne se modifie pas sur cette source` });

    const v = valeur?.trim() || null;
    const r = await q(`UPDATE ${cible.table} SET ${col} = :v WHERE ${cible.cle} = :id`,
                      { v, id: cible.valeurCle });
    if (!r.rowsAffected) return res.status(404).json({ erreur: "ligne source introuvable" });
    // La trace « manuel » : c'est elle qui protege la saisie des imports.
    await q(`MERGE INTO ENRICHISSEMENT e
             USING (SELECT :k CIBLE, :ch CHAMP, 'manuel' SOURCE FROM DUAL) s
               ON (e.CIBLE = s.CIBLE AND e.CHAMP = s.CHAMP AND e.SOURCE = s.SOURCE)
             WHEN MATCHED THEN UPDATE SET VALEUR = :v, CONFIANCE = 'certain',
                    DETAIL = :qui, VU_LE = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (CIBLE, TYPE_CIBLE, CHAMP, VALEUR, CONFIANCE, SOURCE, DETAIL)
               VALUES (:k, 'personne', :ch, :v, 'certain', 'manuel', :qui)`,
            { k, ch: champ, v, qui: `uid:${p.uid}` });
    const f = await q(`SELECT * FROM V_PERSONNES WHERE PERSON_KEY = :k`, { k });
    return res.json({ ok: true, fiche: f.rows?.[0] ?? null });
  }

  if (req.method === "DELETE") {
    if (!exigerAdmin(p)) return res.status(403).json({ erreur: "suppression reservee a l'administrateur" });
    const cible = resoudreSource(k);
    if (!cible) return res.status(422).json({ erreur: "fiche non supprimable ici" });
    // L'historique d'envoi est une piece comptable : on ne supprime pas un
    // contact qui a recu du courrier, on l'oppose.
    if (k.startsWith("inv:")) {
      const envois = await q(`SELECT COUNT(*) N FROM INVESTORS.MAILING_SENDS WHERE CONTACT_ID = :id`,
                             { id: cible.valeurCle });
      if ((envois.rows as { N: number }[])[0].N)
        return res.status(409).json({ erreur: "des envois referencent ce contact : utilisez l'opposition" });
      await q(`DELETE FROM INVESTORS.DEMARCHAGE WHERE CONTACT_ID = :id`, { id: cible.valeurCle });
    }
    for (const [table, colonne] of [["CONTACT_STATE", "PERSON_KEY"], ["INTERACTION", "PERSON_KEY"],
                                    ["ENRICHISSEMENT", "CIBLE"], ["CONTACT_LISTE_MEMBRE", "PERSON_KEY"],
                                    ["ATTRIBUT_VALEUR", "PERSON_KEY"]]) {
      await q(`DELETE FROM ${table} WHERE ${colonne} = :k`, { k });
    }
    await q(`DELETE FROM ${cible.table} WHERE ${cible.cle} = :id`, { id: cible.valeurCle });
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
  res.status(405).end();
}
```

- [ ] **Step 3: `pages/api/desinscrits.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { contactsAutorises } from "@/lib/portee";

// Lecture seule : la liste de ceux a qui on n'ecrit plus, toutes sources
// confondues (drapeau de la vue + etat commercial).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const r = await q(`SELECT v.PERSON_KEY, v.SOURCE, v.FIRST_NAME, v.LAST_NAME, v.EMAIL, v.COMPANY
                       FROM V_PERSONNES v
                       LEFT JOIN CONTACT_STATE e ON e.PERSON_KEY = v.PERSON_KEY
                      WHERE v.OPT_OUT = 1 OR NVL(e.OPT_OUT, 0) = 1
                      ORDER BY v.LAST_NAME FETCH FIRST 500 ROWS ONLY`);
  res.json({ total: r.rows?.length ?? 0, rows: r.rows });
}
```

- [ ] **Step 4: Compiler** — Run: `npm run build` — Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add pages/api && git commit -m "API contacts : liste, fiche, ecriture a la source tracee, suppression admin, desinscrits"
```

---

### Task 8: UI Contacts (table, fiche, désinscrits)

**Files:**
- Create: `components/TableContacts.tsx`, `components/FichePersonne.tsx`
- Create: `pages/contacts/index.tsx`, `pages/contacts/desinscrits.tsx`
- Create: `components/SousMenuContacts.tsx`

**Interfaces:**
- Consumes: API T7, `Coquille`/`MandatFournisseur` (T5).
- Produces: page `/contacts` (table paginée + filtres + fiche latérale, édition champ à champ), `/contacts/desinscrits`.

- [ ] **Step 1: `components/SousMenuContacts.tsx`**

```tsx
import Link from "next/link";

const ONGLETS = [
  ["", "Tous les contacts"], ["segments", "Segments"], ["listes", "Listes"],
  ["attributs", "Attributs"], ["import", "Import"], ["desinscrits", "Désinscrits"],
] as const;

export default function SousMenuContacts({ actif }: { actif: string }) {
  return (
    <nav style={{ display: "flex", gap: 18, borderBottom: "1px solid var(--hair-soft)", marginBottom: 18 }}>
      {ONGLETS.map(([id, lib]) => (
        <Link key={id} href={`/contacts/${id}`} style={{
          padding: "8px 2px", color: actif === id ? "var(--ink)" : "var(--ink-2)",
          borderBottom: actif === id ? "2px solid var(--ink)" : "2px solid transparent",
          fontWeight: actif === id ? 600 : 400 }}>{lib}</Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: `components/TableContacts.tsx`**

```tsx
import { useEffect, useState, useCallback } from "react";

export type Personne = {
  PERSON_KEY: string; SOURCE: string; FIRST_NAME: string | null; LAST_NAME: string | null;
  EMAIL: string | null; LINKEDIN_URL: string | null; TITLE: string | null;
  COMPANY: string | null; CITY: string | null; COUNTRY: string | null; OPT_OUT: number;
};

const BASES: Record<string, string> = { investors: "Investisseurs", prospects: "Prospects PACA",
  prospects_dirigeant: "Dirigeants" };
export const nomBase = (s: string) => BASES[s] || (s.startsWith("gate:") ? "Formulaire " + s.slice(5) : s);

export default function TableContacts({ onOuvrir, selection, surSelection }: {
  onOuvrir: (p: Personne) => void;
  selection?: Set<string>;
  surSelection?: (k: string, coche: boolean) => void;
}) {
  const [rows, setRows] = useState<Personne[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  // « joignable » par defaut : les 70 009 fiches de registre sans canal
  // masqueraient tout le reste. Lecon mesuree sur l'outil precedent.
  const [filtre, setFiltre] = useState({ q: "", source: "", canal: "joignable" });

  const charger = useCallback(() => {
    const u = new URLSearchParams({ ...filtre, page: String(page) });
    fetch(`/capgrowth/api/personnes?${u}`).then(r => r.json())
      .then(d => { setRows(d.rows || []); setTotal(d.total || 0); });
  }, [filtre, page]);
  useEffect(charger, [charger]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input placeholder="Nom, société, e-mail…" value={filtre.q}
          onChange={e => { setFiltre({ ...filtre, q: e.target.value }); setPage(0); }} style={{ width: 260 }} />
        <select value={filtre.source} onChange={e => { setFiltre({ ...filtre, source: e.target.value }); setPage(0); }}>
          <option value="">Toutes les bases</option>
          <option value="investors">Investisseurs</option>
          <option value="prospects">Prospects PACA</option>
          <option value="prospects_dirigeant">Dirigeants</option>
          <option value="gate">Formulaires</option>
        </select>
        <select value={filtre.canal} onChange={e => { setFiltre({ ...filtre, canal: e.target.value }); setPage(0); }}>
          <option value="joignable">Joignables</option>
          <option value="email">Avec e-mail</option>
          <option value="linkedin">Avec LinkedIn</option>
          <option value="">Tout le référentiel</option>
        </select>
        <span style={{ alignSelf: "center", color: "var(--ink-3)" }}>
          {total.toLocaleString("fr-FR")} contact{total > 1 ? "s" : ""}</span>
      </div>
      <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: "var(--r)",
        border: "1px solid var(--hair-soft)", boxShadow: "var(--shadow)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead><tr>
            {surSelection && <th />}
            {["Nom", "Société / titre", "Base", "E-mail", "Lieu"].map(h =>
              <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontSize: 10,
                color: "var(--ink-3)", borderBottom: "1px solid var(--hair-soft)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.PERSON_KEY} onClick={() => onOuvrir(r)}
                style={{ cursor: "pointer", borderBottom: "1px solid var(--hair-soft)" }}>
                {surSelection && <td style={{ padding: "7px 0 7px 12px" }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selection?.has(r.PERSON_KEY) ?? false}
                    onChange={e => surSelection(r.PERSON_KEY, e.target.checked)} /></td>}
                <td style={{ padding: "7px 12px", fontWeight: 600 }}>
                  {[r.FIRST_NAME, r.LAST_NAME].filter(Boolean).join(" ") || "—"}
                  {r.OPT_OUT === 1 && <span className="pill crit" style={{ marginLeft: 6 }}>opt-out</span>}</td>
                <td style={{ padding: "7px 12px", color: "var(--ink-2)" }}>
                  {r.COMPANY || "—"}{r.TITLE ? ` · ${r.TITLE}` : ""}</td>
                <td style={{ padding: "7px 12px" }}><span className="pill">{nomBase(r.SOURCE)}</span></td>
                <td style={{ padding: "7px 12px" }}>{r.EMAIL || "—"}</td>
                <td style={{ padding: "7px 12px" }}>{[r.CITY, r.COUNTRY].filter(Boolean).join(", ") || "—"}</td>
              </tr>))}
            {!rows.length && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center",
              color: "var(--ink-3)" }}>Aucun résultat.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
        <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button>
        <span style={{ color: "var(--ink-3)" }}>{page * 60 + 1}–{Math.min((page + 1) * 60, total)} sur {total.toLocaleString("fr-FR")}</span>
        <button className="btn" disabled={(page + 1) * 60 >= total} onClick={() => setPage(page + 1)}>Suivant</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `components/FichePersonne.tsx` — trois blocs : référentiel (éditable → source), état, frise**

```tsx
import { useEffect, useState, useCallback } from "react";
import { useMandat } from "@/lib/mandat";
import { nomBase } from "./TableContacts";

const CHAMPS: [string, string][] = [["prenom", "Prénom"], ["nom", "Nom"], ["titre", "Titre"],
  ["societe", "Société"], ["email", "E-mail"], ["telephone", "Téléphone"],
  ["linkedin", "LinkedIn"], ["ville", "Ville"], ["pays", "Pays"], ["notes", "Notes"]];
const COLONNE: Record<string, string> = { prenom: "FIRST_NAME", nom: "LAST_NAME", titre: "TITLE",
  societe: "COMPANY", email: "EMAIL", telephone: "PHONE", linkedin: "LINKEDIN_URL",
  ville: "CITY", pays: "COUNTRY", notes: "NOTES" };

export default function FichePersonne({ personKey, admin, onFermer, onChange }: {
  personKey: string; admin: boolean; onFermer: () => void; onChange: () => void;
}) {
  const { mandat } = useMandat();
  const [d, setD] = useState<Record<string, never> | null>(null);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState("");
  const [msg, setMsg] = useState("");

  const charger = useCallback(() => {
    fetch(`/capgrowth/api/personnes/${encodeURIComponent(personKey)}?client=${mandat?.ID ?? 0}`)
      .then(r => r.json()).then(setD);
  }, [personKey, mandat]);
  useEffect(charger, [charger]);

  async function enregistrer(champ: string) {
    setMsg("Enregistrement…");
    const r = await fetch(`/capgrowth/api/personnes/${encodeURIComponent(personKey)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ champ, valeur: brouillon }) });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    setMsg("Écrit à la source."); setEnEdition(null); charger(); onChange();
  }

  async function supprimer() {
    if (!confirm("Supprimer définitivement ce contact du référentiel ?")) return;
    const r = await fetch(`/capgrowth/api/personnes/${encodeURIComponent(personKey)}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) { setMsg(j.erreur); return; }
    onFermer(); onChange();
  }

  if (!d) return null;
  const fiche = d["fiche"] as Record<string, string | number | null>;
  const frise = (d["frise"] as Record<string, string>[]) || [];
  return (
    <aside style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 420, overflowY: "auto",
      background: "var(--card)", borderLeft: "1px solid var(--hair-soft)",
      boxShadow: "var(--shadow)", padding: 24, zIndex: 30 }}>
      <button className="btn" style={{ float: "right" }} onClick={onFermer}>×</button>
      <h2 style={{ fontSize: 17 }}>{[fiche.FIRST_NAME, fiche.LAST_NAME].filter(Boolean).join(" ") || "—"}</h2>
      <div style={{ color: "var(--ink-3)", marginBottom: 14 }}>
        <span className="pill">{nomBase(String(fiche.SOURCE))}</span>
      </div>

      <h3 style={{ fontSize: 10, color: "var(--ink-3)", margin: "14px 0 8px" }}>
        Référentiel — l'édition écrit à la source</h3>
      <dl style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "5px 10px", margin: 0 }}>
        {CHAMPS.map(([champ, libelle]) => (
          <FragmentChamp key={champ} champ={champ} libelle={libelle}
            valeur={fiche[COLONNE[champ]] as string | null}
            enEdition={enEdition === champ} brouillon={brouillon}
            surEdition={() => { setEnEdition(champ); setBrouillon(String(fiche[COLONNE[champ]] ?? "")); }}
            surBrouillon={setBrouillon} surOk={() => enregistrer(champ)}
            surAnnule={() => setEnEdition(null)} />
        ))}
      </dl>
      {msg && <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 6 }}>{msg}</div>}

      <h3 style={{ fontSize: 10, color: "var(--ink-3)", margin: "18px 0 8px" }}>Frise</h3>
      {frise.length ? frise.map((i, n) => (
        <div key={n} style={{ padding: "6px 0", borderBottom: "1px solid var(--hair-soft)", fontSize: 11 }}>
          <b>{i.TYPE}</b> · {i.CANAL} · {new Date(i.QUAND).toLocaleString("fr-FR",
            { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          {i.CAMPAGNE && <span className="pill" style={{ marginLeft: 6 }}>{i.CAMPAGNE}</span>}
          {i.RESUME && <div style={{ color: "var(--ink-2)" }}>{i.RESUME}</div>}
        </div>
      )) : <div style={{ color: "var(--ink-3)", fontSize: 11 }}>Aucune interaction.</div>}

      {admin && <button className="btn" style={{ marginTop: 20, color: "var(--crit)" }}
        onClick={supprimer}>Supprimer (admin)</button>}
    </aside>
  );
}

function FragmentChamp({ champ, libelle, valeur, enEdition, brouillon,
  surEdition, surBrouillon, surOk, surAnnule }: {
  champ: string; libelle: string; valeur: string | null; enEdition: boolean; brouillon: string;
  surEdition: () => void; surBrouillon: (v: string) => void; surOk: () => void; surAnnule: () => void;
}) {
  return (<>
    <dt style={{ color: "var(--ink-3)", fontSize: 10, alignSelf: "center" }}>{libelle}</dt>
    <dd style={{ margin: 0 }}>
      {enEdition ? (
        <span style={{ display: "flex", gap: 4 }}>
          <input value={brouillon} onChange={e => surBrouillon(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === "Enter") surOk(); if (e.key === "Escape") surAnnule(); }}
            style={{ flex: 1, padding: "4px 8px" }} data-champ={champ} />
          <button className="btn" onClick={surOk}>✓</button>
        </span>
      ) : (
        <span onClick={surEdition} title="Cliquer pour corriger — écrit dans la table d'origine"
          style={{ cursor: "text", display: "block", minHeight: 16 }}>{valeur || <i style={{ color: "var(--ink-3)" }}>—</i>}</span>
      )}
    </dd>
  </>);
}
```

- [ ] **Step 4: `pages/contacts/index.tsx` et `pages/contacts/desinscrits.tsx`**

```tsx
// pages/contacts/index.tsx
import { useState } from "react";
import { useSession } from "next-auth/react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import TableContacts, { Personne } from "@/components/TableContacts";
import FichePersonne from "@/components/FichePersonne";
import { MandatFournisseur } from "@/lib/mandat";

export default function PageContacts() {
  const { data: session } = useSession();
  const admin = (session as never as { portee?: { role: string } })?.portee?.role === "admin";
  const [ouvert, setOuvert] = useState<Personne | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="" />
        <TableContacts key={version} onOuvrir={setOuvert} />
        {ouvert && <FichePersonne personKey={ouvert.PERSON_KEY} admin={admin}
          onFermer={() => setOuvert(null)} onChange={() => setVersion(v => v + 1)} />}
      </Coquille>
    </MandatFournisseur>
  );
}
```

```tsx
// pages/contacts/desinscrits.tsx
import { useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur } from "@/lib/mandat";
import { nomBase } from "@/components/TableContacts";

export default function PageDesinscrits() {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  useEffect(() => {
    fetch("/capgrowth/api/desinscrits").then(r => r.json()).then(d => setRows(d.rows || []));
  }, []);
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="desinscrits" />
        <p style={{ color: "var(--ink-3)" }}>Personnes à qui l'on n'écrit plus. Lecture seule —
          un refus se respecte, il ne s'édite pas.</p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <tbody>{rows.map(r => (
            <tr key={r.PERSON_KEY} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
              <td style={{ padding: "7px 12px", fontWeight: 600 }}>
                {[r.FIRST_NAME, r.LAST_NAME].filter(Boolean).join(" ")}</td>
              <td style={{ padding: "7px 12px" }}>{r.EMAIL || "—"}</td>
              <td style={{ padding: "7px 12px" }}>{r.COMPANY || "—"}</td>
              <td style={{ padding: "7px 12px" }}><span className="pill">{nomBase(r.SOURCE)}</span></td>
            </tr>))}
          </tbody>
        </table>
      </Coquille>
    </MandatFournisseur>
  );
}
```

- [ ] **Step 5: Compiler + tests** — Run: `npm run build && npm test` — Expected: OK, 10 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "UI Contacts : table joignable par defaut, fiche editable a la source, desinscrits"
```

---

### Task 9: Segments (par mandat)

**Files:**
- Create: `pages/api/segments/index.ts`, `pages/api/segments/[id].ts`
- Create: `pages/contacts/segments.tsx`

**Interfaces:**
- Consumes: `construireFiltre` (T6), table `LISTE` + `CLIENT_ID` (T3), `clientAutorise` (T4).
- Produces: `GET/POST /api/segments?client=` ; `GET /api/segments/<id>?client=` → `{ segment, total, rows }` (le filtre rejoué) ; `DELETE`.

- [ ] **Step 1: `pages/api/segments/index.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { construireFiltre } from "@/lib/personnes";

/*
 * Un segment est un filtre enregistre, rejoue a chaque usage — jamais des
 * lignes. Sur un referentiel qui bouge tous les jours, une photo se perime ;
 * un critere rend l'etat du jour. (Table LISTE existante, desormais par mandat.)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`SELECT ID, NOM, FILTRE, CANAL, DERNIER_ENVOI, LIGNES_ENVOYEES, UPDATED_AT
                         FROM LISTE WHERE CLIENT_ID = :cid ORDER BY UPDATED_AT DESC`, { cid });
    return res.json({ rows: (r.rows as { FILTRE: string }[]).map(l => ({ ...l, FILTRE: JSON.parse(l.FILTRE) })) });
  }
  if (req.method === "POST") {
    const { nom, filtre } = (req.body ?? {}) as { nom?: string; filtre?: Record<string, string> };
    if (!nom) return res.status(400).json({ erreur: "nom requis" });
    construireFiltre(filtre ?? {}); // valide les cles avant d'enregistrer
    await q(`MERGE INTO LISTE l USING (SELECT :cid CID, :nom NOM FROM DUAL) s
               ON (l.CLIENT_ID = s.CID AND l.NOM = s.NOM)
             WHEN MATCHED THEN UPDATE SET FILTRE = :f, UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, NOM, FILTRE, CANAL, CREE_PAR)
               VALUES (:cid, :nom, :f, 'mixte', :qui)`,
            { cid, nom, f: JSON.stringify(filtre ?? {}), qui: `uid:${p.uid}` });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
```

- [ ] **Step 2: `pages/api/segments/[id].ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";
import { construireFiltre } from "@/lib/personnes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const id = Number(req.query.id);
  const seg = await q(`SELECT ID, CLIENT_ID, NOM, FILTRE FROM LISTE WHERE ID = :id`, { id });
  const s = (seg.rows as { ID: number; CLIENT_ID: number; NOM: string; FILTRE: string }[])[0];
  // Le 404 vaut aussi pour « pas votre mandat » : ne pas confirmer l'existence.
  if (!s || !clientAutorise(p, s.CLIENT_ID)) return res.status(404).json({ erreur: "segment inconnu" });

  if (req.method === "GET") {
    const { where, binds } = construireFiltre(JSON.parse(s.FILTRE));
    const rows = await q(`SELECT PERSON_KEY, SOURCE, FIRST_NAME, LAST_NAME, EMAIL, COMPANY
                            FROM V_PERSONNES WHERE ${where}
                           ORDER BY LAST_NAME FETCH FIRST 60 ROWS ONLY`, binds);
    const c = await q(`SELECT COUNT(*) N FROM V_PERSONNES WHERE ${where}`, binds);
    return res.json({ segment: { ...s, FILTRE: JSON.parse(s.FILTRE) },
                      total: (c.rows as { N: number }[])[0].N, rows: rows.rows });
  }
  if (req.method === "DELETE") {
    await q(`DELETE FROM LISTE WHERE ID = :id`, { id });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "DELETE"]); res.status(405).end();
}
```

- [ ] **Step 3: `pages/contacts/segments.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

function Segments() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, never>[]>([]);
  const [nom, setNom] = useState("");
  const [filtre, setFiltre] = useState({ source: "investors", canal: "email", pays: "" });
  const [apercu, setApercu] = useState<{ total: number } | null>(null);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/segments?client=${mandat.ID}`).then(r => r.json()).then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function creer() {
    if (!nom || !mandat) return;
    await fetch(`/capgrowth/api/segments`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: mandat.ID, nom, filtre }) });
    setNom(""); charger();
  }
  async function voir(id: number) {
    const d = await (await fetch(`/capgrowth/api/segments/${id}?client=${mandat?.ID}`)).json();
    setApercu({ total: d.total });
  }

  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <input placeholder="Nom du segment" value={nom} onChange={e => setNom(e.target.value)} />
      <select value={filtre.source} onChange={e => setFiltre({ ...filtre, source: e.target.value })}>
        <option value="investors">Investisseurs</option><option value="prospects">Prospects PACA</option>
        <option value="gate">Formulaires</option><option value="">Toutes bases</option>
      </select>
      <select value={filtre.canal} onChange={e => setFiltre({ ...filtre, canal: e.target.value })}>
        <option value="email">E-mail</option><option value="linkedin">LinkedIn</option>
        <option value="joignable">Joignable</option>
      </select>
      <input placeholder="Pays (FR…)" value={filtre.pays} style={{ width: 90 }}
        onChange={e => setFiltre({ ...filtre, pays: e.target.value })} />
      <button className="btn bleu" onClick={creer}>Enregistrer le segment</button>
    </div>
    {apercu && <p className="pill ok">{apercu.total.toLocaleString("fr-FR")} personnes aujourd'hui</p>}
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <tbody>{rows.map(s => (
        <tr key={s["ID"]} style={{ borderBottom: "1px solid var(--hair-soft)" }}>
          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{s["NOM"]}</td>
          <td style={{ padding: "8px 12px", color: "var(--ink-3)" }}>{JSON.stringify(s["FILTRE"])}</td>
          <td style={{ padding: "8px 12px" }}>
            <button className="btn" onClick={() => voir(s["ID"])}>Compter aujourd'hui</button></td>
        </tr>))}
      </tbody>
    </table>
  </>);
}

export default function PageSegments() {
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="segments" />
        <p style={{ color: "var(--ink-3)" }}>Un segment est un filtre rejoué à chaque usage —
          il rend l'état du référentiel du jour, pas une photo.</p>
        <Segments />
      </Coquille>
    </MandatFournisseur>
  );
}
```

- [ ] **Step 4: Compiler** — `npm run build` — Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Segments par mandat : filtres rejoues, 404 muet hors portee"
```

---

### Task 10: Listes statiques

**Files:**
- Create: `pages/api/listes/index.ts`, `pages/api/listes/[id].ts`
- Create: `pages/contacts/listes.tsx`
- Modify: `pages/contacts/index.tsx` (sélection multiple + « Ajouter à une liste »)

**Interfaces:**
- Consumes: tables `CONTACT_LISTE`/`CONTACT_LISTE_MEMBRE` (T3), `clientAutorise` (T4), `TableContacts` `selection`/`surSelection` (T8).
- Produces: `GET/POST /api/listes?client=` ; `GET /api/listes/<id>` → membres ; `POST /api/listes/<id>` `{ person_keys: string[] }` ajoute ; `DELETE /api/listes/<id>`.

- [ ] **Step 1: `pages/api/listes/index.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

// Une liste statique est un ensemble FIGE : on y met des personnes, elles y
// restent. L'oppose exact du segment — les deux existent, comme chez Brevo.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`SELECT l.ID, l.NOM, l.NOTES, l.CREATED_AT,
                              (SELECT COUNT(*) FROM CONTACT_LISTE_MEMBRE m WHERE m.LISTE_ID = l.ID) MEMBRES
                         FROM CONTACT_LISTE l WHERE l.CLIENT_ID = :cid ORDER BY l.CREATED_AT DESC`, { cid });
    return res.json({ rows: r.rows });
  }
  if (req.method === "POST") {
    const { nom, notes } = (req.body ?? {}) as { nom?: string; notes?: string };
    if (!nom) return res.status(400).json({ erreur: "nom requis" });
    await q(`MERGE INTO CONTACT_LISTE l USING (SELECT :cid CID, :nom NOM FROM DUAL) s
               ON (l.CLIENT_ID = s.CID AND l.NOM = s.NOM)
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, NOM, NOTES) VALUES (:cid, :nom, :notes)`,
            { cid, nom, notes: notes ?? null });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST"]); res.status(405).end();
}
```

- [ ] **Step 2: `pages/api/listes/[id].ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q, qLot, oracledb } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const id = Number(req.query.id);
  const l = await q(`SELECT ID, CLIENT_ID, NOM FROM CONTACT_LISTE WHERE ID = :id`, { id });
  const liste = (l.rows as { ID: number; CLIENT_ID: number; NOM: string }[])[0];
  if (!liste || !clientAutorise(p, liste.CLIENT_ID)) return res.status(404).json({ erreur: "liste inconnue" });

  if (req.method === "GET") {
    const r = await q(`SELECT m.PERSON_KEY, m.AJOUTE_LE, v.FIRST_NAME, v.LAST_NAME, v.EMAIL, v.COMPANY, v.SOURCE
                         FROM CONTACT_LISTE_MEMBRE m
                         JOIN V_PERSONNES v ON v.PERSON_KEY = m.PERSON_KEY
                        WHERE m.LISTE_ID = :id ORDER BY v.LAST_NAME`, { id });
    return res.json({ liste, rows: r.rows });
  }
  if (req.method === "POST") {
    const { person_keys } = (req.body ?? {}) as { person_keys?: string[] };
    if (!Array.isArray(person_keys) || !person_keys.length)
      return res.status(400).json({ erreur: "person_keys requis" });
    // MERGE ligne a ligne en lot : re-ajouter un membre present est un non-evenement.
    await qLot(`MERGE INTO CONTACT_LISTE_MEMBRE m
                USING (SELECT :id LISTE_ID, :k PERSON_KEY FROM DUAL) s
                  ON (m.LISTE_ID = s.LISTE_ID AND m.PERSON_KEY = s.PERSON_KEY)
                WHEN NOT MATCHED THEN INSERT (LISTE_ID, PERSON_KEY) VALUES (:id, :k)`,
      person_keys.map(k => ({ id, k })),
      { id: { type: oracledb.NUMBER }, k: { type: oracledb.STRING, maxSize: 620 } });
    return res.json({ ok: true, ajoutes: person_keys.length });
  }
  if (req.method === "DELETE") {
    await q(`DELETE FROM CONTACT_LISTE WHERE ID = :id`, { id });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST", "DELETE"]); res.status(405).end();
}
```

- [ ] **Step 3: `pages/contacts/listes.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

function Listes() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<Record<string, never>[]>([]);
  const [nom, setNom] = useState("");
  const [membres, setMembres] = useState<Record<string, string>[] | null>(null);

  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json()).then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);

  async function creer() {
    if (!nom || !mandat) return;
    await fetch(`/capgrowth/api/listes`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: mandat.ID, nom }) });
    setNom(""); charger();
  }
  async function ouvrir(id: number) {
    const d = await (await fetch(`/capgrowth/api/listes/${id}`)).json();
    setMembres(d.rows);
  }
  return (<>
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input placeholder="Nom de la liste" value={nom} onChange={e => setNom(e.target.value)} />
      <button className="btn bleu" onClick={creer}>Créer</button>
    </div>
    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
      <tbody>{rows.map(l => (
        <tr key={l["ID"]} style={{ borderBottom: "1px solid var(--hair-soft)", cursor: "pointer" }}
          onClick={() => ouvrir(l["ID"])}>
          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{l["NOM"]}</td>
          <td style={{ padding: "8px 12px" }}>{l["MEMBRES"]} membre(s)</td>
        </tr>))}
      </tbody>
    </table>
    {membres && <div style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 12 }}>Membres</h3>
      {membres.map(m => <div key={m.PERSON_KEY} style={{ padding: "5px 0",
        borderBottom: "1px solid var(--hair-soft)" }}>
        {[m.FIRST_NAME, m.LAST_NAME].filter(Boolean).join(" ")} — {m.EMAIL || "sans e-mail"}</div>)}
    </div>}
  </>);
}

export default function PageListes() {
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="listes" />
        <p style={{ color: "var(--ink-3)" }}>Une liste est figée : ce qu'on y met y reste.
          Pour un ciblage vivant, utilisez un segment.</p>
        <Listes />
      </Coquille>
    </MandatFournisseur>
  );
}
```

- [ ] **Step 4: Ajouter la sélection multiple dans `pages/contacts/index.tsx`**

Remplacer le corps du composant `PageContacts` :
```tsx
export default function PageContacts() {
  const { data: session } = useSession();
  const admin = (session as never as { portee?: { role: string } })?.portee?.role === "admin";
  const [ouvert, setOuvert] = useState<Personne | null>(null);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="" />
        {selection.size > 0 && <BarreSelection selection={selection} surVide={() => setSelection(new Set())} />}
        <TableContacts key={version} onOuvrir={setOuvert} selection={selection}
          surSelection={(k, coche) => setSelection(s => {
            const n = new Set(s); if (coche) n.add(k); else n.delete(k); return n; })} />
        {ouvert && <FichePersonne personKey={ouvert.PERSON_KEY} admin={admin}
          onFermer={() => setOuvert(null)} onChange={() => setVersion(v => v + 1)} />}
      </Coquille>
    </MandatFournisseur>
  );
}

function BarreSelection({ selection, surVide }: { selection: Set<string>; surVide: () => void }) {
  const { mandat } = useMandat();
  const [listes, setListes] = useState<{ ID: number; NOM: string }[]>([]);
  const [cible, setCible] = useState(0);
  useEffect(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/listes?client=${mandat.ID}`).then(r => r.json())
      .then(d => setListes(d.rows || []));
  }, [mandat]);
  async function ajouter() {
    if (!cible) return;
    await fetch(`/capgrowth/api/listes/${cible}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person_keys: [...selection] }) });
    surVide();
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10,
      background: "var(--bg-alt)", borderRadius: 12, padding: "8px 12px" }}>
      <b>{selection.size} sélectionné(s)</b>
      <select value={cible} onChange={e => setCible(Number(e.target.value))}>
        <option value={0}>Ajouter à une liste…</option>
        {listes.map(l => <option key={l.ID} value={l.ID}>{l.NOM}</option>)}
      </select>
      <button className="btn bleu" onClick={ajouter}>Ajouter</button>
      <button className="btn" onClick={surVide}>Annuler</button>
    </div>
  );
}
```
Ajouter les imports manquants en tête du fichier : `useEffect`, `useMandat`.

- [ ] **Step 5: Compiler** — `npm run build` — Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Listes statiques par mandat, selection multiple depuis la table"
```

---

### Task 11: Attributs et Import (admin)

**Files:**
- Create: `pages/api/attributs/index.ts`, `pages/api/attributs/valeur.ts`, `pages/api/import.ts`
- Create: `pages/contacts/attributs.tsx`, `pages/contacts/import.tsx`

**Interfaces:**
- Consumes: tables `ATTRIBUT_LIBRE`/`ATTRIBUT_VALEUR` (T3), `qLot` (T2), `exigerAdmin` (T4).
- Produces: `GET/POST/DELETE /api/attributs?client=` ; `POST /api/attributs/valeur` `{ attribut_id, person_key, valeur }` ; `POST /api/import` (CSV brut en corps, `?applique=1` pour écrire) → insertion `INVESTORS.CONTACTS` dédupliquée par e-mail.

- [ ] **Step 1: `pages/api/attributs/index.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

/*
 * Les attributs du referentiel sont les 17 colonnes de V_PERSONNES — figes.
 * Ici on ne gere que les champs LIBRES d'un mandat. Interdire de doublonner
 * une colonne du referentiel evite deux verites pour la meme donnee.
 */
const RESERVES = ["prenom", "nom", "titre", "societe", "email", "telephone",
  "linkedin", "ville", "pays", "notes", "source", "territoire", "secteur"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  const cid = Number(req.query.client || (req.body as { client?: number })?.client || 0);
  if (!cid || !clientAutorise(p, cid)) return res.status(403).json({ erreur: "mandat hors portee" });

  if (req.method === "GET") {
    const r = await q(`SELECT ID, NOM, TYPE FROM ATTRIBUT_LIBRE WHERE CLIENT_ID = :cid ORDER BY NOM`, { cid });
    return res.json({ rows: r.rows });
  }
  if (req.method === "POST") {
    const { nom, type } = (req.body ?? {}) as { nom?: string; type?: string };
    if (!nom) return res.status(400).json({ erreur: "nom requis" });
    if (RESERVES.includes(nom.toLowerCase()))
      return res.status(409).json({ erreur: `« ${nom} » existe deja dans le referentiel` });
    await q(`MERGE INTO ATTRIBUT_LIBRE a USING (SELECT :cid CID, :nom NOM FROM DUAL) s
               ON (a.CLIENT_ID = s.CID AND a.NOM = s.NOM)
             WHEN NOT MATCHED THEN INSERT (CLIENT_ID, NOM, TYPE)
               VALUES (:cid, :nom, NVL(:t, 'texte'))`, { cid, nom, t: type ?? null });
    return res.json({ ok: true });
  }
  if (req.method === "DELETE") {
    const aid = Number((req.body as { id?: number })?.id);
    await q(`DELETE FROM ATTRIBUT_LIBRE WHERE ID = :aid AND CLIENT_ID = :cid`, { aid, cid });
    return res.json({ ok: true });
  }
  res.setHeader("Allow", ["GET", "POST", "DELETE"]); res.status(405).end();
}
```

- [ ] **Step 2: `pages/api/attributs/valeur.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { clientAutorise, contactsAutorises } from "@/lib/portee";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!contactsAutorises(p)) return res.status(403).json({ erreur: "reserve a Arx" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }
  const { attribut_id, person_key, valeur } = (req.body ?? {}) as
    { attribut_id?: number; person_key?: string; valeur?: string };
  if (!attribut_id || !person_key) return res.status(400).json({ erreur: "attribut_id et person_key requis" });
  const a = await q(`SELECT CLIENT_ID FROM ATTRIBUT_LIBRE WHERE ID = :id`, { id: attribut_id });
  const cid = (a.rows as { CLIENT_ID: number }[])[0]?.CLIENT_ID;
  if (!cid || !clientAutorise(p, cid)) return res.status(404).json({ erreur: "attribut inconnu" });
  await q(`MERGE INTO ATTRIBUT_VALEUR v USING (SELECT :aid AID, :k K FROM DUAL) s
             ON (v.ATTRIBUT_ID = s.AID AND v.PERSON_KEY = s.K)
           WHEN MATCHED THEN UPDATE SET VALEUR = :val, MAJ_LE = SYSTIMESTAMP
           WHEN NOT MATCHED THEN INSERT (ATTRIBUT_ID, PERSON_KEY, VALEUR)
             VALUES (:aid, :k, :val)`,
        { aid: attribut_id, k: person_key, val: valeur ?? null });
  res.json({ ok: true });
}
```

- [ ] **Step 3: `pages/api/import.ts`**

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import Papa from "papaparse";
import { q, qLot, oracledb } from "@/lib/oracle";
import { porteeDepuis } from "@/lib/auth";
import { exigerAdmin } from "@/lib/portee";

/*
 * Import CSV — admin seulement : un fichier verse dans le referentiel partage
 * pollue tous les mandats s'il est mauvais.
 *
 * Colonnes reconnues : email (obligatoire), prenom, nom, titre, societe,
 * telephone, linkedin, ville, pays. Dedoublonnage par e-mail : une adresse
 * deja connue est ignoree — l'import n'ecrase JAMAIS l'existant, et encore
 * moins une saisie manuelle.
 *
 * Sans ?applique=1 : simulation, rien n'est ecrit.
 */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const p = await porteeDepuis(req, res);
  if (!p) return res.status(401).json({ erreur: "non connecte" });
  if (!exigerAdmin(p)) return res.status(403).json({ erreur: "import reserve a l'administrateur" });
  if (req.method !== "POST") { res.setHeader("Allow", ["POST"]); return res.status(405).end(); }

  const csv = typeof req.body === "string" ? req.body : (req.body as { csv?: string })?.csv;
  if (!csv?.trim()) return res.status(400).json({ erreur: "csv requis" });

  const parse = Papa.parse<Record<string, string>>(csv, {
    header: true, skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase(),
  });
  const lignes = parse.data
    .map(l => ({ email: (l.email || "").trim().toLowerCase(), prenom: l.prenom || null,
      nom: l.nom || null, titre: l.titre || null, societe: l.societe || null,
      telephone: l.telephone || null, linkedin: l.linkedin || null,
      ville: l.ville || null, pays: (l.pays || "").toUpperCase() || null }))
    .filter(l => RE_EMAIL.test(l.email));

  const existants = new Set<string>();
  const emails = lignes.map(l => l.email);
  for (let i = 0; i < emails.length; i += 500) {
    const lot = emails.slice(i, i + 500);
    const binds: Record<string, string> = {};
    lot.forEach((e, n) => { binds[`e${n}`] = e; });
    const r = await q(`SELECT LOWER(EMAIL) E FROM INVESTORS.CONTACTS
                        WHERE LOWER(EMAIL) IN (${lot.map((_, n) => `:e${n}`).join(",")})`, binds);
    (r.rows as { E: string }[]).forEach(x => existants.add(x.E));
  }
  const nouveaux = lignes.filter(l => !existants.has(l.email));

  if (req.query.applique !== "1") {
    return res.json({ simulation: true, lignes_lues: parse.data.length,
      valides: lignes.length, deja_connus: lignes.length - nouveaux.length,
      a_inserer: nouveaux.length });
  }

  const S = (n: number) => ({ type: oracledb.STRING, maxSize: n });
  await qLot(`INSERT INTO INVESTORS.CONTACTS
      (CONTACT_ID, FULL_NAME, FIRST_NAME, LAST_NAME, JOB_TITLE, ORG_NAME,
       EMAIL, PHONE, LINKEDIN_URL, CITY, COUNTRY,
       SOURCES, LEGAL_BASIS, LOADED_AT)
    VALUES (:email, TRIM(NVL(:prenom,' ') || ' ' || NVL(:nom,' ')), :prenom, :nom, :titre, :societe,
            :email, :telephone, :linkedin, :ville, :pays,
            '["MANUAL/Import"]', 'legitimate_interest_b2b', SYSTIMESTAMP)`,
    nouveaux,
    { email: S(320), prenom: S(120), nom: S(200), titre: S(400), societe: S(600),
      telephone: S(24), linkedin: S(500), ville: S(160), pays: S(2) });
  res.json({ simulation: false, inseres: nouveaux.length,
             deja_connus: lignes.length - nouveaux.length });
}
```

- [ ] **Step 4: `pages/contacts/attributs.tsx` et `pages/contacts/import.tsx`**

```tsx
// pages/contacts/attributs.tsx
import { useCallback, useEffect, useState } from "react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur, useMandat } from "@/lib/mandat";

const REFERENTIEL = ["Prénom", "Nom", "Titre", "Société", "E-mail", "Téléphone",
  "LinkedIn", "Ville", "Pays", "Notes", "Source", "Territoire", "Secteur"];

function Attributs() {
  const { mandat } = useMandat();
  const [rows, setRows] = useState<{ ID: number; NOM: string; TYPE: string }[]>([]);
  const [nom, setNom] = useState("");
  const [type, setType] = useState("texte");
  const [msg, setMsg] = useState("");
  const charger = useCallback(() => {
    if (!mandat) return;
    fetch(`/capgrowth/api/attributs?client=${mandat.ID}`).then(r => r.json()).then(d => setRows(d.rows || []));
  }, [mandat]);
  useEffect(charger, [charger]);
  async function creer() {
    if (!nom || !mandat) return;
    const r = await fetch(`/capgrowth/api/attributs`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client: mandat.ID, nom, type }) });
    const j = await r.json();
    setMsg(r.ok ? "" : j.erreur); if (r.ok) { setNom(""); charger(); }
  }
  return (<>
    <h3 style={{ fontSize: 12, margin: "10px 0" }}>Attributs du référentiel (figés)</h3>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {REFERENTIEL.map(a => <span key={a} className="pill">{a}</span>)}
    </div>
    <h3 style={{ fontSize: 12, margin: "18px 0 10px" }}>Champs libres du mandat</h3>
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <input placeholder="Nom du champ" value={nom} onChange={e => setNom(e.target.value)} />
      <select value={type} onChange={e => setType(e.target.value)}>
        <option value="texte">texte</option><option value="nombre">nombre</option><option value="date">date</option>
      </select>
      <button className="btn bleu" onClick={creer}>Créer</button>
      {msg && <span style={{ color: "var(--crit)", alignSelf: "center" }}>{msg}</span>}
    </div>
    {rows.map(a => <div key={a.ID} style={{ padding: "6px 0",
      borderBottom: "1px solid var(--hair-soft)" }}>{a.NOM} <span className="pill">{a.TYPE}</span></div>)}
  </>);
}

export default function PageAttributs() {
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="attributs" />
        <Attributs />
      </Coquille>
    </MandatFournisseur>
  );
}
```

```tsx
// pages/contacts/import.tsx
import { useState } from "react";
import { useSession } from "next-auth/react";
import Coquille from "@/components/Coquille";
import SousMenuContacts from "@/components/SousMenuContacts";
import { MandatFournisseur } from "@/lib/mandat";

export default function PageImport() {
  const { data: session } = useSession();
  const admin = (session as never as { portee?: { role: string } })?.portee?.role === "admin";
  const [csv, setCsv] = useState("");
  const [resultat, setResultat] = useState<Record<string, number | boolean> | null>(null);

  async function lancer(applique: boolean) {
    const r = await fetch(`/capgrowth/api/import${applique ? "?applique=1" : ""}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }) });
    setResultat(await r.json());
  }
  return (
    <MandatFournisseur>
      <Coquille section="contacts">
        <h1 style={{ fontSize: 22, marginBottom: 14 }}>Contacts</h1>
        <SousMenuContacts actif="import" />
        {!admin ? <p className="pill warn">Import réservé à l'administrateur : un fichier versé
          dans le référentiel partagé concerne tous les mandats.</p> : (<>
          <p style={{ color: "var(--ink-3)" }}>Colonnes : email (obligatoire), prenom, nom, titre,
            societe, telephone, linkedin, ville, pays. Une adresse déjà connue est ignorée —
            l'import n'écrase jamais l'existant.</p>
          <textarea rows={10} style={{ width: "100%", fontFamily: "monospace" }}
            placeholder={"email,prenom,nom,societe\njane@acme.com,Jane,Doe,Acme"}
            value={csv} onChange={e => setCsv(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={() => lancer(false)}>Simuler</button>
            <button className="btn bleu" onClick={() => lancer(true)}
              disabled={!resultat || resultat["simulation"] !== true}>Importer</button>
          </div>
          {resultat && <pre style={{ background: "var(--bg-alt)", padding: 12, borderRadius: 10 }}>
            {JSON.stringify(resultat, null, 1)}</pre>}
        </>)}
      </Coquille>
    </MandatFournisseur>
  );
}
```

- [ ] **Step 5: Compiler + tests** — `npm run build && npm test` — Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Attributs libres par mandat et import CSV admin, simulation d'abord"
```

---

### Task 12: Déploiement (modèle arx-linki)

**Files:**
- Create: `Dockerfile`, `deploy/run.sh`, `deploy/deploy.sh`

**Interfaces:**
- Produces: `https://arx-consulting.com/capgrowth` en service ; secrets `/root/.capgrowth_secret` ; redéploiement par `deploy.sh`.

- [ ] **Step 1: `Dockerfile`**

```dockerfile
# Deux etages : le build reste hors de l'image servie.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# oracledb et adm-zip sont externes au bundle standalone : on les embarque.
COPY --from=build /app/node_modules/oracledb ./node_modules/oracledb
COPY --from=build /app/node_modules/adm-zip ./node_modules/adm-zip
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: `deploy/run.sh` (labels Traefik, modèle arx-linki : basePath, pas de strip)**

```bash
#!/usr/bin/env bash
# CapGrowthAI — conteneur manuel (modele arx-linki). Secrets depuis /root/,
# convention ACCES-OCI.md : jamais en dur ici.
set -euo pipefail
NAME=capgrowth

ORA_PASSWORD=$(sudo cat /root/.ora_prospects)
ORA_WALLET_PASSWORD=$(sudo cat /root/.ora_wallet_password)
ORA_WALLET_B64=$(sudo cat /root/.ora_wallet_b64 2>/dev/null || sudo base64 -w0 /home/ubuntu/ora-wallet.zip)
if ! sudo test -s /root/.capgrowth_secret; then
  openssl rand -base64 32 | sudo tee /root/.capgrowth_secret >/dev/null
  sudo chmod 600 /root/.capgrowth_secret
fi
SECRET=$(sudo cat /root/.capgrowth_secret)

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --network coolify --restart unless-stopped \
  -e ORA_USER=prospects \
  -e ORA_PASSWORD="$ORA_PASSWORD" \
  -e ORA_CONNECT=arxdb01_low \
  -e ORA_WALLET_B64="$ORA_WALLET_B64" \
  -e ORA_WALLET_PASSWORD="$ORA_WALLET_PASSWORD" \
  -e NEXTAUTH_SECRET="$SECRET" \
  -e NEXTAUTH_URL=https://arx-consulting.com/capgrowth \
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
```
Note d'exécution : vérifier d'abord où vit le wallet (`ls /home/ubuntu/ora-wallet*`, `sudo ls /root/ | grep -i wallet`) et comment `arx-prospects` reçoit `ORA_WALLET_B64` (`sudo docker exec <arx-prospects> printenv | grep -c ORA_WALLET_B64`) ; adapter la ligne `ORA_WALLET_B64=` à la source réelle.

- [ ] **Step 3: `deploy/deploy.sh`**

```bash
#!/usr/bin/env bash
# Reconstruire et relancer depuis le depot GitHub — a executer sur la VM.
set -euo pipefail
cd /home/ubuntu/capgrowth-src
git pull --ff-only
docker build -t capgrowth:latest .
bash deploy/run.sh
sleep 6
curl -sf http://localhost:3000/capgrowth/api/sante >/dev/null 2>&1 \
  || docker exec capgrowth node -e "fetch('http://127.0.0.1:3000/capgrowth/api/sante').then(r=>{if(!r.ok)process.exit(1)})"
echo "deploiement verifie"
```

- [ ] **Step 4: Créer le dépôt GitHub et pousser**

```bash
gh repo create benoit-sigwald/capgrowthai --public --source . --push
```
Expected: dépôt créé, branche master poussée.

- [ ] **Step 5: Premier déploiement**

```bash
ssh -i ~/.ssh/oci-work.key ubuntu@145.241.174.15 'git clone https://github.com/benoit-sigwald/capgrowthai /home/ubuntu/capgrowth-src 2>/dev/null || (cd /home/ubuntu/capgrowth-src && git pull); cd /home/ubuntu/capgrowth-src && bash deploy/deploy.sh'
```
Expected: `deploiement verifie`.

- [ ] **Step 6: Vérifier en ligne**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://arx-consulting.com/capgrowth/connexion
```
Expected: `200`. Puis connexion réelle dans le navigateur avec le compte admin (Task 3) : la coquille s'affiche, le sélecteur montre « Innovat Property », la table Contacts rend 3 879 joignables.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile deploy && git commit -m "Deploiement : image standalone, labels Traefik modele linki" && git push
```

---

### Task 13: Test d'étanchéité multi-mandat

**Files:**
- Create: `scripts/verifier-etancheite.sh`

**Interfaces:**
- Consumes: l'application déployée (T12), un second mandat + un compte `membre` créés pour l'essai.

- [ ] **Step 1: Créer le jeu d'essai (mandat B + membre affecté à B seul)**

Dans le conteneur gate (mêmes conventions que Task 3), exécuter :
```sql
ALTER SESSION SET CURRENT_SCHEMA = PROSPECTS;
MERGE INTO CLIENT c USING (SELECT 'ETANCHEITE-TEST' NOM FROM DUAL) s ON (c.NOM = s.NOM)
  WHEN NOT MATCHED THEN INSERT (NOM) VALUES (s.NOM);
-- utilisateur membre-b, hash bcrypt genere comme en Task 3, ROLE 'membre',
-- affecte au seul client ETANCHEITE-TEST :
MERGE INTO UTILISATEUR u USING (SELECT 'membre-b@test.local' EMAIL FROM DUAL) s
  ON (LOWER(u.EMAIL) = s.EMAIL)
  WHEN NOT MATCHED THEN INSERT (EMAIL, NOM, HASH, ROLE) VALUES (s.EMAIL, 'Membre B', :hash, 'membre');
INSERT INTO AFFECTATION (UTILISATEUR_ID, CLIENT_ID)
  SELECT u.ID, c.ID FROM UTILISATEUR u, CLIENT c
   WHERE u.EMAIL = 'membre-b@test.local' AND c.NOM = 'ETANCHEITE-TEST'
   AND NOT EXISTS (SELECT 1 FROM AFFECTATION a WHERE a.UTILISATEUR_ID = u.ID AND a.CLIENT_ID = c.ID);
```

- [ ] **Step 2: `scripts/verifier-etancheite.sh`**

```bash
#!/usr/bin/env bash
# L'etancheite se prouve, elle ne se declare pas. Deux sessions, cinq controles.
set -uo pipefail
BASE=https://arx-consulting.com/capgrowth
KO=0
ok() { echo "ok    $1"; }
ko() { echo "ECHEC $1"; KO=1; }

connexion() { # $1 email  $2 motdepasse  -> cookies dans $3
  CSRF=$(curl -sc "$3" "$BASE/api/auth/csrf" | python3 -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
  curl -sb "$3" -c "$3" -X POST "$BASE/api/auth/callback/credentials" \
    --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$1" \
    --data-urlencode "motdepasse=$2" -o /dev/null
}

ID_A=$1   # id du mandat Innovat Property
ID_B=$2   # id du mandat ETANCHEITE-TEST
connexion "$3" "$4" /tmp/ck_admin   # admin
connexion "$5" "$6" /tmp/ck_b       # membre-b

# 1. le membre B ne lit pas les segments du mandat A
C=$(curl -sb /tmp/ck_b -o /dev/null -w "%{http_code}" "$BASE/api/segments?client=$ID_A")
[ "$C" = "403" ] && ok "segments du mandat A refuses au membre B ($C)" || ko "segments A visibles par B ($C)"
# 2. il ne peut pas y ecrire
C=$(curl -sb /tmp/ck_b -o /dev/null -w "%{http_code}" -X POST "$BASE/api/segments" \
  -H "Content-Type: application/json" -d "{\"client\":$ID_A,\"nom\":\"intrusion\"}")
[ "$C" = "403" ] && ok "ecriture segment mandat A refusee ($C)" || ko "ecriture segment A acceptee ($C)"
# 3. une liste du mandat A repond 404 (sans confirmer l'existence)
LID=$(curl -sb /tmp/ck_admin "$BASE/api/listes?client=$ID_A" | python3 -c "import json,sys;r=json.load(sys.stdin)['rows'];print(r[0]['ID'] if r else 0)")
if [ "$LID" != "0" ]; then
  C=$(curl -sb /tmp/ck_b -o /dev/null -w "%{http_code}" "$BASE/api/listes/$LID")
  [ "$C" = "404" ] && ok "liste du mandat A invisible pour B ($C)" || ko "liste A lisible par B ($C)"
fi
# 4. sans session : tout est ferme
C=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/personnes")
[ "$C" = "401" ] || [ "$C" = "302" ] && ok "API fermee sans session ($C)" || ko "API ouverte sans session ($C)"
# 5. l'import est refuse au non-admin
C=$(curl -sb /tmp/ck_b -o /dev/null -w "%{http_code}" -X POST "$BASE/api/import" \
  -H "Content-Type: application/json" -d '{"csv":"email\nx@y.zz"}')
[ "$C" = "403" ] && ok "import refuse au membre ($C)" || ko "import accepte a un membre ($C)"

[ $KO = 0 ] && echo "etancheite verifiee" || { echo "FUITE DETECTEE"; exit 1; }
```

- [ ] **Step 3: Exécuter**

```bash
bash scripts/verifier-etancheite.sh <ID_A> <ID_B> <email_admin> <mdp_admin> membre-b@test.local <mdp_b>
```
Expected: 5 × `ok`, `etancheite verifiee`.

- [ ] **Step 4: Nettoyer le jeu d'essai** (supprimer `membre-b@test.local` et le mandat `ETANCHEITE-TEST` en SQL), puis :

```bash
git add scripts/verifier-etancheite.sh && git commit -m "Etancheite multi-mandat prouvee par cinq controles" && git push
```

---

## Self-review

- **Couverture du spec (tranche 1)** : coquille + navigation complète (T5), sélecteur de mandat (T5), comptes/rôles (T3/T5), Tous les contacts (T7/T8), fiche 3 blocs + écriture à la source tracée (T7/T8), suppression admin + refus 409 si envois (T7), Segments (T9), Listes (T10), Attributs (T11), Import admin (T11), Désinscrits (T7/T8), déploiement (T12), étanchéité (T13). Les sections hors tranche 1 sont grisées avec motif (T5) — conforme.
- **Types cohérents** : `Portee`/`porteeDepuis` identiques T4→T11 ; `construireFiltre` partagé T6/T7/T9 ; `qLot(sql, lignes, bindDefs)` identique T2/T10/T11.
- **Points de vigilance signalés en tâche** : la source exacte de `ORA_WALLET_B64` (T12 step 2, note) ; le mot de passe admin transmis oralement, jamais écrit (T3 step 3).

## Exécution

Plan complet et enregistré. Deux options :

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque.
**2. Inline** — exécution dans cette session, points de contrôle par tâche.
