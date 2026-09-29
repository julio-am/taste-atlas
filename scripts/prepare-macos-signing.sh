#!/usr/bin/env bash
set -euo pipefail

# This runs only on GitHub-hosted macOS runners. Private material comes from Actions secrets.
for name in MACOS_CERTIFICATE_P12_BASE64 MACOS_CERTIFICATE_PASSWORD APPLE_API_KEY_P8_BASE64 APPLE_API_KEY_ID APPLE_API_ISSUER_ID; do
  if [[ -z "${!name:-}" ]]; then
    echo "::error::Missing GitHub Actions secret: $name"
    exit 1
  fi
done

certificate="$RUNNER_TEMP/tastemate-developer-id.p12"
api_key="$RUNNER_TEMP/AuthKey_${APPLE_API_KEY_ID}.p8"
keychain="$RUNNER_TEMP/tastemate-signing.keychain-db"
keychain_password="$(openssl rand -hex 24)"

umask 077
printf '%s' "$MACOS_CERTIFICATE_P12_BASE64" | base64 -D > "$certificate"
printf '%s' "$APPLE_API_KEY_P8_BASE64" | base64 -D > "$api_key"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$certificate" -P "$MACOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$keychain"
security set-key-partition-list -S apple-tool:,apple: -k "$keychain_password" "$keychain"
security list-keychain -d user -s "$keychain"
rm -f "$certificate"

identity="$(security find-identity -v -p codesigning "$keychain" | awk '/"Developer ID Application:/{print $2; exit}')"
if [[ -z "$identity" ]]; then
  echo '::error::The P12 must contain a valid Developer ID Application certificate and its private key.'
  exit 1
fi

{
  echo "TASTEMATE_SIGN_MACOS=1"
  echo "MACOS_SIGN_IDENTITY=$identity"
  echo "MACOS_KEYCHAIN_PATH=$keychain"
  echo "APPLE_API_KEY=$api_key"
  echo "APPLE_API_KEY_ID=$APPLE_API_KEY_ID"
  echo "APPLE_API_ISSUER=$APPLE_API_ISSUER_ID"
} >> "$GITHUB_ENV"
echo 'Developer ID Application signing identity is ready.'
