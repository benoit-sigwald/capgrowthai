#!/usr/bin/env python3
"""Filtre les fichiers complets des registres publics contre NOS noms.

Tourne sur l'hote, pas dans le conteneur : le fichier GLEIF fait 4,96 Go une
fois decompresse, et le conteneur du lot n'a ni « unzip » ni la place. On le
lit en flux, on ne garde que les lignes dont le nom ressemble a l'un des
notres, et on rend quelques milliers de lignes au lieu de 3,4 millions.

Repartition des roles, volontaire : ce script FILTRE, il ne conclut pas. La
normalisation existe ici et en JavaScript, et deux implantations d'une meme
regle finissent toujours par diverger. Elle sert donc ici de tamis large — le
rapprochement definitif est refait cote Node, sur le nom legal brut transmis
tel quel. Une divergence fait alors rater un rapprochement ; elle n'en invente
jamais un faux.

    python3 registres.py <dossier>

Attend <dossier>/noms.tsv, ecrit <dossier>/gleif-retenus.jsonl et
<dossier>/edgar-retenus.jsonl.
"""
import csv
import json
import subprocess
import sys
import unicodedata
import urllib.request
from pathlib import Path

UA = "Arx Consulting enrichissement benoit.p.g.sigwald@gmail.com"
EDGAR_LOOKUP = "https://www.sec.gov/Archives/edgar/cik-lookup-data.txt"

# Formes juridiques uniquement — jamais « capital », « partners », « ventures »
# ni « group », qui sont des morceaux distinctifs du nom d'un fonds. La liste
# doit rester identique a celle de batch/enrichir-organisations.js.
SUFFIXES = {"sa", "sas", "sarl", "sasu", "sci", "snc", "gmbh", "ag", "bv",
            "nv", "ltd", "limited", "llc", "lp", "llp", "inc", "corp",
            "corporation", "plc", "spa", "srl", "ab", "oy", "kft", "pte",
            "pty", "kk", "sl"}


def normaliser(nom: str) -> str:
    base = unicodedata.normalize("NFD", nom or "")
    base = "".join(c for c in base if unicodedata.category(c) != "Mn").lower()
    base = base.replace(".", "")
    base = "".join(c if c.isalnum() else " " for c in base)
    mots = base.split()
    while len(mots) > 1 and mots[-1] in SUFFIXES:
        mots.pop()
    return " ".join(mots)


def colonnes(entete):
    """Indices des colonnes utiles, par nom : leur position change d'une
    version du format a l'autre, leur nom non."""
    voulu = {
        "lei": "LEI",
        "nom": "Entity.LegalName",
        "pays": "Entity.LegalAddress.Country",
        "juridiction": "Entity.LegalJurisdiction",
        "categorie": "Entity.EntityCategory",
        "forme": "Entity.LegalForm.EntityLegalFormCode",
        "statut_entite": "Entity.EntityStatus",
        "statut": "Registration.RegistrationStatus",
    }
    index = {c: i for i, c in enumerate(entete)}
    trouve = {k: index[v] for k, v in voulu.items() if v in index}
    manquants = [v for k, v in voulu.items() if v not in index]
    if manquants:
        print(f"  colonnes absentes du fichier : {', '.join(manquants)}", file=sys.stderr)
    return trouve


def filtrer_gleif(zip_path: Path, cles: set, sortie: Path) -> int:
    proc = subprocess.Popen(["unzip", "-p", str(zip_path)], stdout=subprocess.PIPE)
    flux = (ligne.decode("utf-8", "replace") for ligne in proc.stdout)
    lecteur = csv.reader(flux)
    entete = next(lecteur)
    col = colonnes(entete)
    gardes = lus = 0
    with sortie.open("w", encoding="utf-8") as f:
        for ligne in lecteur:
            lus += 1
            try:
                nom = ligne[col["nom"]]
            except IndexError:
                continue
            if normaliser(nom) not in cles:
                continue
            gardes += 1
            f.write(json.dumps({
                "lei": ligne[col["lei"]],
                "nom_legal": nom,
                "pays": ligne[col["pays"]] if "pays" in col else None,
                "juridiction": ligne[col["juridiction"]] if "juridiction" in col else None,
                "categorie": ligne[col["categorie"]] if "categorie" in col else None,
                "forme": ligne[col["forme"]] if "forme" in col else None,
                "statut": ligne[col["statut"]] if "statut" in col else None,
                "statut_entite": ligne[col["statut_entite"]] if "statut_entite" in col else None,
            }, ensure_ascii=False) + "\n")
    proc.stdout.close()
    proc.wait()
    print(f"  GLEIF : {lus} lignes lues, {gardes} retenues")
    return gardes


def filtrer_edgar(cles: set, sortie: Path) -> int:
    """cik-lookup-data.txt : « NOM DU DEPOSANT:0000320193: », une ligne par
    deposant, toutes categories (societes, fonds, personnes)."""
    req = urllib.request.Request(EDGAR_LOOKUP, headers={"User-Agent": UA})
    gardes = lus = 0
    with urllib.request.urlopen(req, timeout=120) as flux, sortie.open("w", encoding="utf-8") as f:
        for brut in flux:
            lus += 1
            ligne = brut.decode("utf-8", "replace").strip()
            if not ligne.endswith(":"):
                continue
            morceaux = ligne[:-1].rsplit(":", 1)
            if len(morceaux) != 2:
                continue
            nom, cik = morceaux
            if normaliser(nom) not in cles:
                continue
            gardes += 1
            f.write(json.dumps({"cik": cik.lstrip("0") or "0", "nom_depose": nom},
                               ensure_ascii=False) + "\n")
    print(f"  EDGAR : {lus} lignes lues, {gardes} retenues")
    return gardes


def main():
    dossier = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/registres")
    noms = dossier / "noms.tsv"
    if not noms.exists():
        sys.exit(f"{noms} absent : lancer d'abord « node registres.js --exporter »")
    cles = {l.split("\t")[0] for l in noms.read_text(encoding="utf-8").splitlines() if l}
    print(f"{len(cles)} noms normalises a confronter")

    zip_path = dossier / "gleif.csv.zip"
    if zip_path.exists():
        filtrer_gleif(zip_path, cles, dossier / "gleif-retenus.jsonl")
    else:
        print(f"  {zip_path} absent : passage GLEIF saute")
    filtrer_edgar(cles, dossier / "edgar-retenus.jsonl")


if __name__ == "__main__":
    main()
