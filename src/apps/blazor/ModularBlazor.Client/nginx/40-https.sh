#!/bin/sh
# Runs when the container starts (nginx image: /docker-entrypoint.d). When a password-protected .pfx is mounted at
# /https/aspnetapp.pfx (Aspire does this), converts it to the PEM that nginx needs and adds the https server on 5001.
# Without it the container still serves http on 5000.
set -eu
PFX=/https/aspnetapp.pfx
[ -f "$PFX" ] || { echo "40-https: no $PFX, serving http only"; exit 0; }

PEM=/etc/nginx/certs/site.pem
mkdir -p /etc/nginx/certs
# Windows dev certificates use old PFX encryption: OpenSSL 3 needs -legacy for them.
openssl pkcs12 -legacy -in "$PFX" -nodes -passin "pass:${CERT_PASSWORD:-}" -out "$PEM" 2>/dev/null \
  || openssl pkcs12 -in "$PFX" -nodes -passin "pass:${CERT_PASSWORD:-}" -out "$PEM" \
  || { echo "40-https: cannot read $PFX (wrong CERT_PASSWORD?), serving http only"; exit 0; }

cat > /etc/nginx/conf.d/https.conf <<'EOF'
server {
    listen 5001 ssl;
    ssl_certificate     /etc/nginx/certs/site.pem;
    ssl_certificate_key /etc/nginx/certs/site.pem;
    include /etc/nginx/snippets/app.conf;
}
EOF
echo "40-https: https enabled on 5001"
