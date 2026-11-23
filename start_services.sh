#!/bin/bash
# UBus Production Background Service Runner (Detached & Immune to Terminal Close)

echo "Stopping existing services on ports 8000 and 3000..."

# 1. Kill old processes on ports 8000 and 3000 with multiple methods
fuser -k -9 8000/tcp 2>/dev/null || true
fuser -k -9 3000/tcp 2>/dev/null || true
pkill -9 -u dsriubatac -f "gunicorn" 2>/dev/null || true
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

# 2. Start Django Backend on 127.0.0.1:8000
echo "Starting Django Backend on 127.0.0.1:8000..."
cd /home/dsriubatac/Bus-tracking/backend
source /home/dsriubatac/Bus-tracking/backend/venv/bin/activate
nohup /home/dsriubatac/Bus-tracking/backend/venv/bin/gunicorn core.wsgi:application \
  --bind 127.0.0.1:8000 --workers 2 </dev/null > /home/dsriubatac/backend.log 2>&1 &
disown -a 2>/dev/null || true

# 3. Start Next.js Frontend on 127.0.0.1:3000
echo "Starting Next.js Frontend on 127.0.0.1:3000..."
cd /home/dsriubatac/Bus-tracking/frontend
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nohup /home/dsriubatac/.nvm/versions/node/v20.20.2/bin/node node_modules/next/dist/bin/next start -p 3000 </dev/null > /home/dsriubatac/frontend.log 2>&1 &
disown -a 2>/dev/null || true

sleep 3
echo "=== Service Status Check ==="
ss -tulpn 2>/dev/null | grep -E "8000|3000" || netstat -tulnp 2>/dev/null | grep -E "8000|3000" || true
echo "Services started successfully!"
