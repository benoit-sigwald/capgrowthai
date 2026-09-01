# CapGrowthAI — Tranche 2 (Campagnes) — Plan

> Exécution inline. Contrats précis ici ; le code est écrit une fois, en tâche.
> Règle d'architecture inchangée : **l'envoi ne change pas de main** — la clé
> Brevo, les paliers et les exclusions restent dans arx-mailer ; CapGrowthAI
> le pilote par HTTP interne (`x-mailer-secret`, réseau docker `coolify`).

## Tâches

### T1 — Socle Oracle campagnes (`scripts/creer-socle-campagnes.js`, conteneur gate, ADMIN)
- `PROSPECTS.EXPEDITEUR` : `ID` identity, `CLIENT_ID` NN → CLIENT,
  `UTILISATEUR_ID` NULL → UTILISATEUR (rempli en mode `utilisateur`),
  `EMAIL` NN, `NOM_AFFICHAGE`, `DOMAINE` NN, `BREVO_ID` NUMBER,
  `SPF_OK`/`DKIM_OK` NUMBER(1) déf. 0, `VERIFIE_LE` TIMESTAMP, `CREATED_AT` ;
  UNIQUE `(CLIENT_ID, EMAIL)`.
- `ALTER INVESTORS.MAILING_CAMPAIGNS ADD (CLIENT_ID NUMBER, EXPEDITEUR_EMAIL VARCHAR2(320))`
- `ALTER INVESTORS.MAILING_SENDS ADD (EXPEDITEUR_EMAIL VARCHAR2(320))`
- `ALTER PROSPECTS.CAMPAGNE ADD (CLIENT_ID NUMBER)`
- `GRANT SELECT ON INVESTORS.MAILING_TEMPLATES TO PROSPECTS`
- Seed : expéditeur `christophe.bazaille@innovatproperty.ch` pour le mandat 1
  (drapeaux à 0 — c'est la vérification qui les monte).
- Vérif : tables/colonnes présentes, seed lu.

### T2 — arx-mailer multi-expéditeur (`investor-sources/mailer/app.py`, `mailing/transport.py`)
- `transport.send(..., sender_email=None, sender_name=None)` : en Brevo, le
  payload `sender` devient celui-là ; en SMTP, refus explicite si
  `sender_email` diffère de la boîte OVH (une seule identité possible).
- `/prepare` accepte `client_id` et `sender_email`, les écrit sur la campagne
  et chaque send.
- **Chauffage par domaine** : `plafond_du_jour(cur, domaine)` compte les
  journées d'envoi et le volume du jour du **domaine** ; les lignes
  historiques `EXPEDITEUR_EMAIL NULL` comptent pour
  `christophe.bazaille@innovatproperty.ch` (les 19 envois d'essai étaient
  toutes de lui — dire l'inverse remettrait son domaine à zéro).
- `/send` : plafond calculé sur le domaine de l'expéditeur de la campagne ;
  chaque send parti est estampillé `EXPEDITEUR_EMAIL`.
- Nouvelles routes (même garde `x-mailer-secret`) :
  `GET /senders` (liste Brevo), `POST /senders {email, name}` (création Brevo),
  `GET /chauffage?sender=` → `{domaine, plafond, journees, envoyes_aujourdhui, restant}`
  — source unique des paliers, pas de copie côté CRM.
- Déploiement à chaud (docker cp + restart) + commit investor-sources.
- Vérif : `/health` ok ; `/chauffage?sender=christophe...` rend
  `journees≥1, plafond` cohérent ; `/senders` liste le sender Brevo id 1.

### T3 — Client mailer côté CRM (`lib/mailer.ts` + env)
- `run.sh` : `-e MAILER_BASE=http://arx-mailer:8080`
  `-e MAILER_SECRET=$(sudo cat /root/.mailer_secret)`.
- `lib/mailer.ts` : `appelMailer(chemin, corps?, methode?)` — JSON, en-tête
  secret, erreurs relayées `{erreur}` ; helpers `preparer, envoyer, apercu,
  chauffage, senders, creerSender`.

### T4 — API expéditeurs (`pages/api/expediteurs/…`)
- `GET ?client=` : liste du mandat (portée) + mode du mandat.
- `POST` : mode `mandat` → membre/admin du mandat ; mode `utilisateur` →
  l'expéditeur est rattaché à `p.uid` et un utilisateur n'en crée que pour lui.
  Crée le sender chez Brevo via mailer, insère la ligne, lance une vérif DNS.
- `POST /api/expediteurs/[id]/verifier` : SPF (TXT racine contient
  `include:spf.brevo.com`) + DKIM (`brevo1._domainkey`/`brevo2._domainkey`
  CNAME résolus) via `dns.promises` ; monte `SPF_OK/DKIM_OK/VERIFIE_LE` ;
  rend les **lignes DNS exactes à coller** quand ça manque.
- Envoi bloqué (403 avec motif) si l'expéditeur du mandat n'est pas vérifié.

### T5 — API campagnes (`pages/api/campagnes/…`)
- `GET ?client=` : campagnes du mandat depuis `INVESTORS.MAILING_CAMPAIGNS`
  (filtre `CLIENT_ID`, les historiques NULL ne sont visibles que de l'admin)
  + agrégats `MAILING_SENDS` (envoyés/ouverts/cliqués/répondus/rebonds).
- `POST` : `{nom, segment_id | liste_id, expediteur_id, langue?}` → contrôles
  de portée + expéditeur vérifié + mode du mandat, puis mailer `/prepare`
  (filtre du segment traduit en CSV d'e-mails du référentiel : le mailer
  n'accepte que ses propres filtres pays/type — le CSV est le pont neutre).
- `POST [id]/envoyer {lot}` → mailer `/send` ; relaie plafond/journées.
- `GET [id]` : détail + derniers sends.

### T6 — UI
- `pages/campagnes/index.tsx` : liste, stats, bouton « envoyer un lot »,
  jauge de chauffage (mailer `/chauffage`).
- `pages/campagnes/nouvelle.tsx` : segment/liste → gabarit (lecture
  `MAILING_TEMPLATES`) → expéditeur (imposé en mode utilisateur) → aperçu
  (compte + exclusions) → préparer.
- `pages/parametres/index.tsx` (admin) : mandats (création avec
  `MODE_EXPEDITEUR`), utilisateurs (création, rôle, affectations, mot de passe
  initial généré montré une fois).
- `pages/parametres/expediteurs.tsx` : liste, ajout, état SPF/DKIM, lignes à
  coller, bouton revérifier.
- `pages/index.tsx` : tableau de bord réel du mandat — envois du jour +
  palier, réponses à traiter, en retard, dernières campagnes.
- Coquille : sections Tableau de bord, Campagnes, Paramètres actives.
- APIs support : `pages/api/clients.ts` (GET tous/POST admin),
  `pages/api/utilisateurs.ts` (admin), `pages/api/gabarits.ts` (GET actifs),
  `pages/api/tableau-de-bord.ts`.

### T7 — Vérifications de bout en bout (sans toucher un prospect)
1. Expéditeur Innovat vérifié : SPF_OK=1, DKIM_OK=1 (DNS réel).
2. Campagne de test via CSV portant **uniquement** l'adresse de Benoît,
   `autoriser_doublon`, expéditeur Christophe → `/prepare` 1 cible,
   `/send` 1 envoyé, reçu en boîte (le circuit multi-expéditeur complet).
3. Chauffage : `journees` du domaine innovatproperty.ch ≥ 2 (25/08 et 31/08),
   plafond = palier attendu, et un domaine neuf rend `journees=0, plafond=20`.
4. Étanchéité : membre B (jetable) → campagnes et expéditeurs du mandat 1 en
   403/liste vide ; nettoyage.
5. `synchroniser-crm` relit `CLIENT_ID` : `PROSPECTS.CAMPAGNE.CLIENT_ID`
   rempli pour la campagne de test (maj `lib/crm.js` d'arx-prospects).

### T8 — Sync CRM (`arx-prospects/lib/crm.js`)
- `ingererCampagnes` copie `CLIENT_ID` et `EXPEDITEUR_EMAIL` ; commit + push
  arx-prospects (la sonde déploie).

## Contrats inter-tâches
- `EXPEDITEUR.DOMAINE` = partie après `@`, minuscule — la clé du chauffage.
- Historique `EXPEDITEUR_EMAIL NULL` ≡ `christophe.bazaille@innovatproperty.ch`.
- Réponses mailer relayées telles quelles ; le CRM n'invente aucun compteur.
