#!/usr/bin/env bash
# foodos · deploy — push a foodos instance to a fresh (or existing) Netlify site.
# Usage:
#   ./deploy.sh                       # deploy current dir to the linked site (prod)
#   ./deploy.sh --new <site-name>     # create a NEW netlify site, set key, deploy, wire CI
#
# Requires: netlify CLI (authed), gh (authed), OPENROUTER_API_KEY in env.
# Traps baked in (learned the hard way):
#   - `netlify sites:rename` / `api updateSite` silently no-op → rename via curl PATCH + re-read getSite
#   - no `timeout` on macOS → don't wrap in it
#   - netlify auth token lives in ~/Library/Preferences/netlify/config.json (not ~/.config)
set -euo pipefail
cd "$(dirname "$0")"

API="https://api.netlify.com/api/v1"
tok() { node -e "const fs=require('fs');for(const p of ['$HOME/Library/Preferences/netlify/config.json','$HOME/.config/netlify/config.json']){try{const u=JSON.parse(fs.readFileSync(p,'utf8')).users||{};for(const id of Object.keys(u)){const t=u[id]&&u[id].auth&&u[id].auth.token;if(t){process.stdout.write(t.trim());process.exit(0)}}}catch(e){}}"; }

if [[ "${1:-}" == "--new" ]]; then
  NAME="${2:?usage: ./deploy.sh --new <site-name>}"
  TOK="$(tok)"; [[ -n "$TOK" ]] || { echo "no netlify token — run: netlify login"; exit 1; }
  echo "→ creating site…"
  SITE_ID=$(node -e "const o=JSON.parse(require('child_process').execSync('netlify api createSite --data \'{}\'').toString());console.log(o.id)")
  echo "  site_id=$SITE_ID"
  echo "→ renaming to $NAME (curl PATCH)…"
  curl -s -X PATCH "$API/sites/$SITE_ID" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "{\"name\":\"$NAME\"}" >/dev/null
  GOT=$(curl -s "$API/sites/$SITE_ID" -H "Authorization: Bearer $TOK" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).name))")
  echo "  confirmed name=$GOT  ($([[ "$GOT" == "$NAME" ]] && echo OK || echo 'NAME TAKEN — using '"$GOT"'))"
  netlify link --id "$SITE_ID" >/dev/null
  echo "→ setting OPENROUTER_API_KEY on site…"
  : "${OPENROUTER_API_KEY:?set OPENROUTER_API_KEY in env}"
  netlify env:set OPENROUTER_API_KEY "$OPENROUTER_API_KEY" >/dev/null
  if command -v gh >/dev/null && git remote get-url origin >/dev/null 2>&1; then
    REPO=$(git remote get-url origin | sed -E 's#.*github.com[:/]([^/]+/[^/.]+).*#\1#')
    echo "→ wiring CI secrets on $REPO…"
    printf '%s' "$TOK" | gh secret set NETLIFY_AUTH_TOKEN --repo "$REPO" || true
    printf '%s' "$SITE_ID" | gh secret set NETLIFY_SITE_ID --repo "$REPO" || true
  fi
fi

echo "→ deploying (prod)…"
netlify deploy --prod --dir=. --functions=netlify/functions --message "deploy $(date -u +%Y-%m-%dT%H:%MZ)"
URL=$(netlify api getSite --data "{\"site_id\":\"$(node -e "console.log(require('./.netlify/state.json').siteId)" 2>/dev/null)\"}" 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).ssl_url)}catch(e){}})" || true)
echo "✓ live: ${URL:-see output above}"
echo "  verify: curl -s -o /dev/null -w '%{http_code}' \$URL  (expect 200)"
