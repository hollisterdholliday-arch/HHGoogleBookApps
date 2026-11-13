#!/usr/bin/env bash
# Create a new app from the starter template.
#   scripts/new-app.sh notes "Notes"
# -> apps/notes, package com.hh.notes, launcher name "Notes"
set -euo pipefail

name="${1:-}"; label="${2:-}"
if [[ ! "$name" =~ ^[a-z][a-z0-9]*$ || -z "$label" ]]; then
  echo "Usage: $0 <folder-name: lowercase letters/digits> \"<Display Name>\"" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/apps/$name"
[[ -e "$dest" ]] && { echo "apps/$name already exists" >&2; exit 1; }

cp -r "$root/templates/starter" "$dest"
rm -rf "$dest/build"
mv "$dest/src/main/kotlin/com/hh/starter" "$dest/src/main/kotlin/com/hh/$name"

grep -rl 'com\.hh\.starter' "$dest" | xargs sed -i "s/com\.hh\.starter/com.hh.$name/g"
sed -i "s|<string name=\"app_name\">Starter</string>|<string name=\"app_name\">$label</string>|" \
  "$dest/src/main/res/values/strings.xml"
# Drop the template-only header comment.
sed -i '1,3{/^\/\//d}' "$dest/build.gradle.kts"

echo "Created apps/$name (package com.hh.$name)."
echo "Build it with: ./gradlew :apps:$name:assembleRelease"
