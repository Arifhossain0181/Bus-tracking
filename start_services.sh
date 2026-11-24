#!/bin/bash
# ==============================================================================
# UBus Production Background Service Runner (Detached & Immune to Terminal Close)
# ==============================================================================

echo "Stopping existing services on ports 8000 and 3000..."

# 1. Kill old processes on ports 8000 and 3000 with multiple methods
fuser -k -9 8000/tcp 2>/dev/null || true
fuser -k -9 3000/tcp 2>/dev/null || true
pkill -9 -u dsriubatac -f "gunicorn.*core.wsgi" 2>/dev/null || true
pkill -9 -u dsriubatac -f "next-server" 2>/dev/null || true
pkill -9 -u dsriubatac -f "node.*next" 2>/dev/null || true
sleep 2

# Verify ports are free
for PORT in 8000 3000; do
  PID=$(ss -tulpn 2>/dev/null | grep ":$PORT " | awk '{print $NF}' | sed -E 's/.*pid=([0-9]+).*/\1/' || true)
  if [ -n "$PID" ] && [ "$PID" -gt 0 ] 2>/dev/null; then
    echo "Force killing remaining process $PID on port $PORT..."
    kill -9 "$PID" 2>/dev/null || true
  fi
done
sleep 1

# Ensure Apache .htaccess is clean and points to ports 8000 and 3000
if [ -d "/home/dsriubatac/ubus.dsr.iubat.ac.bd" ]; then
  cat << 'EOF' > /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess
RewriteEngine On
RewriteRule ^api/(.*)$ http://127.0.0.1:8000/api/$1 [P,L]
RewriteRule ^admin/(.*)$ http://127.0.0.1:8000/admin/$1 [P,L]
RewriteRule ^django-static/(.*)$ http://127.0.0.1:8000/static/$1 [P,L]
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L]
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
ss -tulpn 2>/dev/null | grep -E "8000|3000" || netstat -tulnp 2>/dev/null | grep -E "8000|3000" || true
echo "Services started and armed with 24/7 background cron watchdog!"
