#!/bin/bash
# ==============================================================================
# UBus Production Background Service Runner (Detached & Immune to Terminal Close)
# ==============================================================================

echo "Stopping existing services on ports 8000 and 3000..."

# 1. Kill old processes cleanly by user process table
pkill -9 -u dsriubatac -f node 2>/dev/null || true
pkill -9 -u dsriubatac -f gunicorn 2>/dev/null || true
pkill -9 -u dsriubatac -f "next-server" 2>/dev/null || true
sleep 1

# Ensure Apache .htaccess is clean and points to ports 8000 and 3000
if [ -d "/home/dsriubatac/ubus.dsr.iubat.ac.bd" ]; then
  cat << 'EOF' > /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess
RewriteEngine On
RewriteRule ^api/(.*)$ http://127.0.0.1:8000/api/$1 [P,L,QSA]
RewriteRule ^admin/(.*)$ http://127.0.0.1:8000/admin/$1 [P,L,QSA]
RewriteRule ^django-static/(.*)$ http://127.0.0.1:8000/static/$1 [P,L]
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L,QSA]
EOF
  chmod 644 /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess
fi

# 2. Start Django Backend on 127.0.0.1:8000
echo "Starting Django Backend on 127.0.0.1:8000..."
cd /home/dsriubatac/Bus-tracking/backend
source /home/dsriubatac/Bus-tracking/backend/venv/bin/activate
if command -v setsid >/dev/null 2>&1; then
  setsid /home/dsriubatac/Bus-tracking/backend/venv/bin/gunicorn core.wsgi:application \
    --bind 127.0.0.1:8000 --workers 2 </dev/null >> /home/dsriubatac/backend.log 2>&1 &
else
  nohup /home/dsriubatac/Bus-tracking/backend/venv/bin/gunicorn core.wsgi:application \
    --bind 127.0.0.1:8000 --workers 2 </dev/null >> /home/dsriubatac/backend.log 2>&1 &
fi
disown -h -a 2>/dev/null || true
disown -a 2>/dev/null || true

# 3. Start Next.js Frontend on 127.0.0.1:3000
echo "Starting Next.js Frontend on 127.0.0.1:3000..."
cd /home/dsriubatac/Bus-tracking/frontend
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
NODE_EXEC=$(which node 2>/dev/null || echo "/home/dsriubatac/.nvm/versions/node/v20.20.2/bin/node")

if [ -x "$NODE_EXEC" ] && [ -f "node_modules/next/dist/bin/next" ]; then
  if command -v setsid >/dev/null 2>&1; then
    setsid "$NODE_EXEC" node_modules/next/dist/bin/next start -p 3000 </dev/null >> /home/dsriubatac/frontend.log 2>&1 &
  else
    nohup "$NODE_EXEC" node_modules/next/dist/bin/next start -p 3000 </dev/null >> /home/dsriubatac/frontend.log 2>&1 &
  fi
else
  if command -v setsid >/dev/null 2>&1; then
    setsid npm run start -- -p 3000 </dev/null >> /home/dsriubatac/frontend.log 2>&1 &
  else
    nohup npm run start -- -p 3000 </dev/null >> /home/dsriubatac/frontend.log 2>&1 &
  fi
fi
disown -h -a 2>/dev/null || true
disown -a 2>/dev/null || true

# 4. Auto-register cron watchdog so services NEVER die on terminal disconnect or reboot
echo "Registering Keepalive Cron Watchdog in crontab..."
CRON_ENTRY="* * * * * /bin/bash /home/dsriubatac/Bus-tracking/keepalive.sh >/dev/null 2>&1"
CRON_REBOOT="@reboot /bin/bash /home/dsriubatac/Bus-tracking/keepalive.sh >/dev/null 2>&1"
(crontab -l 2>/dev/null | grep -v "keepalive.sh"; echo "$CRON_ENTRY"; echo "$CRON_REBOOT") | crontab -
echo "Keepalive cron registered. Crontab is active."

sleep 3
echo "=== Service Status Check ==="
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ || echo "DOWN")
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/ || echo "DOWN")
echo "Local Backend HTTP status: $BACKEND_STATUS"
echo "Local Frontend HTTP status: $FRONTEND_STATUS"
if [ "$FRONTEND_STATUS" = "DOWN" ] || [ "$FRONTEND_STATUS" = "000" ]; then
  echo "[WARNING] Frontend failed to respond! Last log entries from frontend.log:"
  tail -n 20 /home/dsriubatac/frontend.log || true
fi
ss -tulpn 2>/dev/null | grep -E "8000|3000" || netstat -tulnp 2>/dev/null | grep -E "8000|3000" || true
echo "Services started and armed with 24/7 background cron watchdog!"
