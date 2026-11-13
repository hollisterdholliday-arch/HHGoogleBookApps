#!/usr/bin/env bash
# One-time: create your private release signing key and print the values to
# store as GitHub Actions secrets. Keep the .jks file and passwords safe:
# if you lose them you can't ship updates to installed apps.
set -euo pipefail

out="${1:-$HOME/hh-release.jks}"
[[ -e "$out" ]] && { echo "$out already exists" >&2; exit 1; }
read -rsp "Choose a keystore password (6+ chars): " pass; echo

keytool -genkeypair -keystore "$out" -storepass "$pass" -keypass "$pass" \
  -alias hh-release -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=HH Google Book Apps"

echo
echo "Created $out. Add these repository secrets on GitHub"
echo "(Settings -> Secrets and variables -> Actions -> New repository secret):"
echo "  HH_KEYSTORE_BASE64  = output of: base64 -w0 \"$out\""
echo "  HH_KEYSTORE_PASSWORD = the password you just chose"
echo "  HH_KEY_ALIAS         = hh-release"
echo "  HH_KEY_PASSWORD      = the password you just chose"
