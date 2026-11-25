#!/bin/bash
# ==============================================================================
# UBus Production Background Keepalive & Auto-Recovery Watchdog
# Runs via cron every minute: checks ports 8000 and 3005, restarts if dead.
# Because this runs under crond, closing terminal windows CANNOT terminate it.
# ==============================================================================

# If an update or compilation is currently in progress, do NOT interfere!
if [ -f "/tmp/ubus_updating.lock" ]; then
  exit 0
fi

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
  return 1
}

# 1. Check & Restart Backend (Django on 8000)
if ! is_port_alive 8000; then
  echo "[$TIMESTAMP] [ALERT] Port 8000 (Django Backend) is down. Resurrecting..." >> "$LOG_DIR/keepalive.log"
  ss -lptn "sport = :8000" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | while read -r pid; do
    [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null || true
  done
  pkill -9 -u "$(whoami)" -f "gunicorn.*core.wsgi" 2>/dev/null || true
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

# 2. Check & Restart Frontend (Next.js on 3005)
if ! is_port_alive 3005; then
  echo "[$TIMESTAMP] [ALERT] Port 3005 (Next.js Frontend) is down. Resurrecting..." >> "$LOG_DIR/keepalive.log"
  ss -lptn "sport = :3005" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | while read -r pid; do
    [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null || true
  done
  pkill -9 -u "$(whoami)" -f node 2>/dev/null || true
  sleep 1
  cd "$FRONTEND_DIR" || exit 1
  if [ -x "$NODE_EXEC" ] && [ -f "$FRONTEND_DIR/node_modules/next/dist/bin/next" ]; then
    if command -v setsid >/dev/null 2>&1; then
      setsid "$NODE_EXEC" "$FRONTEND_DIR/node_modules/next/dist/bin/next" start -p 3005 </dev/null >> "$LOG_DIR/frontend.log" 2>&1 &
    else
      nohup "$NODE_EXEC" "$FRONTEND_DIR/node_modules/next/dist/bin/next" start -p 3005 </dev/null >> "$LOG_DIR/frontend.log" 2>&1 &
    fi
  else
    if command -v setsid >/dev/null 2>&1; then
      setsid npm run start -- -p 3005 </dev/null >> "$LOG_DIR/frontend.log" 2>&1 &
    else
      nohup npm run start -- -p 3005 </dev/null >> "$LOG_DIR/frontend.log" 2>&1 &
    fi
  fi
  disown -h -a 2>/dev/null || true
  disown -a 2>/dev/null || true
  echo "[$TIMESTAMP] Next.js Frontend resurrection dispatched." >> "$LOG_DIR/keepalive.log"

  # Touch Passenger restart files
  mkdir -p /home/dsriubatac/Bus-tracking/frontend/tmp 2>/dev/null || true
  touch /home/dsriubatac/Bus-tracking/frontend/tmp/restart.txt 2>/dev/null || true
  mkdir -p /home/dsriubatac/ubus.dsr.iubat.ac.bd/tmp 2>/dev/null || true
  touch /home/dsriubatac/ubus.dsr.iubat.ac.bd/tmp/restart.txt 2>/dev/null || true
  mkdir -p /home/dsriubatac/Bus-tracking/tmp 2>/dev/null || true
  touch /home/dsriubatac/Bus-tracking/tmp/restart.txt 2>/dev/null || true
fi

# 3. Ensure Apache .htaccess is clean and points to ports 8000 and 3005
if [ -d "/home/dsriubatac/ubus.dsr.iubat.ac.bd" ]; then
  cat << 'EOF' > /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess
DirectoryIndex disabled
RewriteEngine On
RewriteBase /

# 1. Django API, Admin & Static -> port 8000
RewriteRule ^api/(.*)$ http://127.0.0.1:8000/api/$1 [P,L,QSA]
RewriteRule ^admin/(.*)$ http://127.0.0.1:8000/admin/$1 [P,L,QSA]
RewriteRule ^static/(.*)$ http://127.0.0.1:8000/static/$1 [P,L]
RewriteRule ^django-static/(.*)$ http://127.0.0.1:8000/static/$1 [P,L]

# 2. Next.js Frontend -> port 3005
RewriteRule ^(.*)$ http://127.0.0.1:3005/$1 [P,L,QSA]
EOF
  chmod 644 /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess
fi
