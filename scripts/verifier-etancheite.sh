#!/usr/bin/env bash
# L'etancheite se prouve, elle ne se declare pas. Cinq controles, deux sessions.
#
#   bash scripts/verifier-etancheite.sh <email_admin> <mdp_admin> <email_membre_b> <mdp_b>
#
# Le membre B doit etre affecte a un mandat DIFFERENT du mandat 1. Chaque 403
# obtenu par B prouve en meme temps que sa session est valide : sans session,
# la meme route rend 401.
set -uo pipefail
B=https://arx-consulting.com/capgrowth
KO=0
ok() { echo "ok    $1"; }
ko() { echo "ECHEC $1"; KO=1; }

connexion() { # $1 email  $2 motdepasse  $3 fichier cookies
  CSRF=$(curl -sc "$3" "$B/api/auth/csrf" | python3 -c "import json,sys;print(json.load(sys.stdin)['csrfToken'])")
  curl -sb "$3" -c "$3" -X POST "$B/api/auth/callback/credentials" \
    --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=$1" \
    --data-urlencode "motdepasse=$2" -o /dev/null
}

connexion "$1" "$2" /tmp/etk_admin
connexion "$3" "$4" /tmp/etk_b

C=$(curl -sb /tmp/etk_b -o /dev/null -w "%{http_code}" "$B/api/segments?client=1")
[ "$C" = "403" ] && ok "segments du mandat 1 refuses a B ($C)" || ko "segments visibles par B ($C)"

C=$(curl -sb /tmp/etk_b -o /dev/null -w "%{http_code}" -X POST "$B/api/segments?client=1" \
  -H "Content-Type: application/json" -d '{"nom":"intrusion"}')
[ "$C" = "403" ] && ok "ecriture segment refusee ($C)" || ko "ecriture acceptee ($C)"

LID=$(curl -sb /tmp/etk_admin "$B/api/listes?client=1" | python3 -c "import json,sys;r=json.load(sys.stdin)['rows'];print(r[0]['ID'] if r else 0)")
if [ "$LID" != "0" ]; then
  C=$(curl -sb /tmp/etk_b -o /dev/null -w "%{http_code}" "$B/api/listes/$LID")
  [ "$C" = "404" ] && ok "liste du mandat 1 invisible pour B ($C)" || ko "liste lisible par B ($C)"
fi

C=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/personnes")
{ [ "$C" = "401" ] || [ "$C" = "302" ]; } && ok "API fermee sans session ($C)" || ko "API ouverte sans session ($C)"

C=$(curl -sb /tmp/etk_b -o /dev/null -w "%{http_code}" -X POST "$B/api/import" \
  -H "Content-Type: application/json" -d '{"csv":"email\nx@y.zz"}')
[ "$C" = "403" ] && ok "import refuse au membre ($C)" || ko "import accepte ($C)"

rm -f /tmp/etk_admin /tmp/etk_b
[ $KO = 0 ] && echo "ETANCHEITE VERIFIEE" || { echo "FUITE DETECTEE"; exit 1; }
