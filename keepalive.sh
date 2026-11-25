#!/bin/bash
# ==============================================================================
# UBus Production Background Keepalive & Auto-Recovery Watchdog
# Runs via cron every minute: checks ports 8000 and 3000, restarts if dead.
# Because this runs under crond, closing terminal windows CANNOT terminate it.
# ==============================================================================

BACKEND_DIR="/home/dsriubatac/Bus-tracking/backend"
FRONTEND_DIR="/home/dsriubatac/Bus-tracking/frontend"
VENV_GUNICORN="/home/dsriubatac/Bus-tracking/backend/venv/bin/gunicorn"
LOG_DIR="/home/dsriubatac"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Ensure NVM / Node environment
export NVM_DIR="/home/dsriubatac/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
NODE_EXEC=$(which node 2>/dev/null || echo "/home/dsriubatac/.nvm/versions/node/v20.20.2/bin/node")

# Helper to check if a port is listening or responding
is_port_alive() {
  local PORT=$1
  if curl -s -m 2 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
    return 0
  fi
  if ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
    return 0
  fi
  if netstat -tuln 2>/dev/null | grep -q ":$PORT "; then
    return 0
  fi
  if fuser "$PORT/tcp" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# 1. Check & Restart Backend (Django on 8000)
if ! is_port_alive 8000; then
  echo "[$TIMESTAMP] [ALERT] Port 8000 (Django Backend) is down. Resurrecting..." >> "$LOG_DIR/keepalive.log"
  fuser -k -9 8000/tcp 2>/dev/null || true
  pkill -9 -u dsriubatac -f "gunicorn.*core.wsgi" 2>/dev/null || true
  sleep 1
  cd "$BACKEND_DIR" || exit 1
  source "$BACKEND_DIR/venv/bin/activate"
  if command -v setsid >/dev/null 2>&1; then
    setsid "$VENV_GUNICORN" core.wsgi:application --bind 127.0.0.1:8000 --workers 2 </dev/null >> "$LOG_DIR/backend.log" 2>&1 &
  else
    nohup "$VENV_GUNICORN" core.wsgi:application --bind 127.0.0.1:8000 --workers 2 </dev/null >> "$LOG_DIR/backend.log" 2>&1 &
  fi
  disown -h -a 2>/dev/null || true
  disown -a 2>/dev/null || true
  echo "[$TIMESTAMP] Django Backend resurrection dispatched." >> "$LOG_DIR/keepalive.log"
fi

# 2. Check & Restart Frontend (Next.js on 3000)
if ! is_port_alive 3000; then
  echo "[$TIMESTAMP] [ALERT] Port 3000 (Next.js Frontend) is down. Resurrecting..." >> "$LOG_DIR/keepalive.log"
  killall -9 -u dsriubatac node 2>/dev/null || true
  pkill -9 -u dsriubatac -f node 2>/dev/null || true
  for P in $(lsof -ti:3000 2>/dev/null); do kill -9 "$P" 2>/dev/null || true; done
  /usr/sbin/fuser -k -9 3000/tcp 2>/dev/null || true
  /sbin/fuser -k -9 3000/tcp 2>/dev/null || true
  fuser -k -9 3000/tcp 2>/dev/null || true
  sleep 1
  cd "$FRONTEND_DIR" || exit 1
  if [ -x "$NODE_EXEC" ] && [ -f "$FRONTEND_DIR/node_modules/next/dist/bin/next" ]; then
    if command -v setsid >/dev/null 2>&1; then
      setsid "$NODE_EXEC" "$FRONTEND_DIR/node_modules/next/dist/bin/next" start -p 3000 </dev/null >> "$LOG_DIR/frontend.log" 2>&1 &
    else
      nohup "$NODE_EXEC" "$FRONTEND_DIR/node_modules/next/dist/bin/next" start -p 3000 </dev/null >> "$LOG_DIR/frontend.log" 2>&1 &
    fi
  else
    if command -v setsid >/dev/null 2>&1; then
      setsid npm run start -- -p 3000 </dev/null >> "$LOG_DIR/frontend.log" 2>&1 &
    else
      nohup npm run start -- -p 3000 </dev/null >> "$LOG_DIR/frontend.log" 2>&1 &
    fi
  fi
  disown -h -a 2>/dev/null || true
  disown -a 2>/dev/null || true
  echo "[$TIMESTAMP] Next.js Frontend resurrection dispatched." >> "$LOG_DIR/keepalive.log"
fi

# 3. Ensure Apache .htaccess is clean and points to ports 8000 and 3000
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
