#!/usr/bin/env bash
set -euo pipefail

# Check the app that a user actually copies from the finished DMG, not just the build directory.
dmg="$(find out/make -type f -name '*.dmg' -print -quit)"
if [[ -z "$dmg" ]]; then
  echo 'No DMG found in out/make.' >&2
  exit 1
fi

volume="$(mktemp -d "${RUNNER_TEMP:-/tmp}/taste-atlas-volume.XXXXXX")"
installed="$(mktemp -d "${RUNNER_TEMP:-/tmp}/taste-atlas-installed.XXXXXX")/Taste Atlas.app"
mounted=0
cleanup() {
  if [[ "$mounted" == 1 ]]; then hdiutil detach "$volume" >/dev/null 2>&1 || true; fi
  rm -rf "$volume" "$(dirname "$installed")"
}
trap cleanup EXIT

hdiutil attach -nobrowse -readonly -mountpoint "$volume" "$dmg" >/dev/null
mounted=1
ditto "$volume/Taste Atlas.app" "$installed"
codesign --verify --deep --strict --verbose=2 "$installed"
xcrun stapler validate "$installed"
spctl --assess --type execute --verbose=4 "$installed"
details="$(codesign -dv --verbose=4 "$installed" 2>&1)"
if ! grep -q 'Authority=Developer ID Application:' <<< "$details"; then
  echo 'The app is not signed with a Developer ID Application certificate.' >&2
  exit 1
fi
echo 'The app copied from the DMG has a valid Developer ID signature and stapled notarization ticket.'
