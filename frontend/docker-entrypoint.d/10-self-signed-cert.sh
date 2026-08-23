#!/bin/sh
# Runs automatically before nginx starts (nginx's base image executes every
# *.sh in /docker-entrypoint.d/). Ensures /etc/nginx/certs always has a
# usable certificate so the HTTPS server block in nginx.conf never fails to
# bind, even if the operator hasn't installed a real one yet.
set -e

CERT_DIR=/etc/nginx/certs
CERT_FILE="$CERT_DIR/fullchain.pem"
KEY_FILE="$CERT_DIR/privkey.pem"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "10-self-signed-cert.sh: certificate already present in $CERT_DIR, leaving it in place"
    exit 0
fi

echo "10-self-signed-cert.sh: no certificate found - generating a self-signed one for HTTPS"
mkdir -p "$CERT_DIR"
openssl req -x509 -nodes -days 3650 \
    -newkey rsa:2048 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -subj "/CN=inventarsystem"
