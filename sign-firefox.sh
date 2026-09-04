#!/usr/bin/env bash
# Signs the Firefox build with Mozilla and drops a permanently installable .xpi
# in dist/signed/. Credentials live outside the repo.
set -euo pipefail

KEYS="${AMO_KEYS_FILE:-$HOME/.config/loknot/amo-keys.md}"

if [ -z "${AMO_JWT_ISSUER:-}" ] || [ -z "${AMO_JWT_SECRET:-}" ]; then
  [ -f "$KEYS" ] || { echo "No credentials. Set AMO_JWT_ISSUER/AMO_JWT_SECRET, or put your AMO keys in $KEYS"; exit 1; }
  AMO_JWT_ISSUER="$(grep -oE 'user:[0-9]+:[0-9]+' "$KEYS" | head -1)"
  AMO_JWT_SECRET="$(grep -oE '[0-9a-f]{40,}' "$KEYS" | head -1)"
fi
[ -n "$AMO_JWT_ISSUER" ] && [ -n "$AMO_JWT_SECRET" ] || { echo "Could not read credentials from $KEYS"; exit 1; }

node build.js >/dev/null
VERSION="$(node -p "require('./dist/extension-firefox/manifest.json').version")"
echo "signing Loknot $VERSION (AMO rejects a version it has already seen — bump VERSION in build.js if so)"

npx --yes web-ext sign \
  --source-dir dist/extension-firefox \
  --artifacts-dir dist/signed \
  --channel unlisted \
  --api-key "$AMO_JWT_ISSUER" \
  --api-secret "$AMO_JWT_SECRET"
