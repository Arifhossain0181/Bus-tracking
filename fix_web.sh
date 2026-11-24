#!/bin/bash
# ==============================================================================
# UBus Web Server & Reverse Proxy Diagnostic & Auto-Fix Script
# ==============================================================================
set -e

echo "=== 1. Checking / Fixing .htaccess Configuration ==="
HTACCESS_PATH="/home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess"

if [ -d "/home/dsriubatac/ubus.dsr.iubat.ac.bd" ]; then
  cat << 'EOF' > "$HTACCESS_PATH"
<IfModule mod_passenger.c>
  PassengerEnabled off
</IfModule>

<IfModule mod_headers.c>
  RequestHeader set X-Forwarded-Proto "https" env=HTTPS
</IfModule>

RewriteEngine On
RewriteBase /

# 1. Django API & Admin -> port 8000
RewriteRule ^api/(.*)$ http://127.0.0.1:8000/api/$1 [P,L]
RewriteRule ^admin/(.*)$ http://127.0.0.1:8000/admin/$1 [P,L]
RewriteRule ^django-static/(.*)$ http://127.0.0.1:8000/static/$1 [P,L]

# 2. Next.js Frontend -> port 3000
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_URI} !^/admin/
RewriteCond %{REQUEST_URI} !^/django-static/
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
EOF
  chmod 644 "$HTACCESS_PATH"
  echo "Clean .htaccess written successfully to $HTACCESS_PATH."
else
  echo "WARNING: Directory /home/dsriubatac/ubus.dsr.iubat.ac.bd not found."
fi

echo ""
echo "=== 2. Checking Local Port Listeners ==="
ss -tulpn 2>/dev/null | grep -E "8000|3000" || netstat -tulnp 2>/dev/null | grep -E "8000|3000" || true

echo ""
echo "=== 3. Testing Local Backend (Port 8000) ==="
curl -s -o /dev/null -w "Backend HTTP Status: %{http_code}\n" http://127.0.0.1:8000/api/ || echo "Backend unreachable on 8000!"

echo ""
echo "=== 4. Testing Local Frontend (Port 3000) ==="
curl -s -o /dev/null -w "Frontend HTTP Status: %{http_code}\n" http://127.0.0.1:3000/ || echo "Frontend unreachable on 3000!"

echo ""
echo "=== 5. Testing External Domain via Apache (https://ubus.dsr.iubat.ac.bd/) ==="
curl -k -s -o /dev/null -w "External Domain HTTP Status: %{http_code}\n" https://ubus.dsr.iubat.ac.bd/ || echo "External domain failed!"

echo ""
echo "=== 6. Restarting Services if any are missing ==="
bash /home/dsriubatac/Bus-tracking/start_services.sh

echo ""
echo "=== Complete! Check your browser: https://ubus.dsr.iubat.ac.bd/live-map ==="
