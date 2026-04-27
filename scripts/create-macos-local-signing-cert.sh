#!/bin/bash
# Creates a reusable self-signed macOS code signing certificate.
#
# Usage:
#   ./scripts/create-macos-local-signing-cert.sh [name] [password] [output-dir]
#
# Store the printed base64 value and password in GitHub Secrets. Keep the
# generated files private; the same certificate must be reused for future
# releases to keep macOS privacy grants stable across app updates.

set -euo pipefail

NAME="${1:-CC Session Local Code Signing}"
PASSWORD="${2:-$(openssl rand -base64 24)}"
OUT_DIR="${3:-.macos-signing}"

mkdir -p "$OUT_DIR"

KEY_PATH="$OUT_DIR/macos-local-signing.key"
CERT_PATH="$OUT_DIR/macos-local-signing.crt"
P12_PATH="$OUT_DIR/macos-local-signing.p12"
B64_PATH="$OUT_DIR/macos-local-signing.p12.base64"

openssl req \
  -x509 \
  -newkey rsa:2048 \
  -sha256 \
  -days 3650 \
  -nodes \
  -keyout "$KEY_PATH" \
  -out "$CERT_PATH" \
  -subj "/CN=$NAME/" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=codeSigning"

openssl pkcs12 \
  -export \
  -legacy \
  -name "$NAME" \
  -inkey "$KEY_PATH" \
  -in "$CERT_PATH" \
  -out "$P12_PATH" \
  -passout "pass:$PASSWORD"

if base64 -i "$P12_PATH" -o "$B64_PATH" 2>/dev/null; then
  :
else
  base64 "$P12_PATH" > "$B64_PATH"
fi

chmod 600 "$KEY_PATH" "$P12_PATH"

cat <<EOF
Created: $P12_PATH
Base64:  $B64_PATH

GitHub Secrets:
  MACOS_SIGNING_CERTIFICATE          = contents of $B64_PATH
  MACOS_SIGNING_CERTIFICATE_PASSWORD = $PASSWORD

Keep $OUT_DIR private. Reuse this same certificate for future releases.
EOF
