#!/bin/bash
# UBus Production Background Service Runner (Detached & Immune to Terminal Close)

echo "Starting UBus Services in background (detached mode)..."

# 1. Kill old processes on ports 8000 and 3000 if running
pkill -u dsriubatac -f "gunicorn.*core.wsgi" 2>/dev/null || true
pkill -u dsriubatac -f "node.*next" 2>/dev/null || true
sleep 1

# 2. Start Django Backend on 127.0.0.1:8000
cd /home/dsriubatac/Bus-tracking/backend
source /home/dsriubatac/Bus-tracking/backend/venv/bin/activate
nohup /home/dsriubatac/Bus-tracking/backend/venv/bin/gunicorn core.wsgi:application \
  --bind 127.0.0.1:8000 --workers 2 </dev/null > /home/dsriubatac/backend.log 2>&1 &
disown -a

# 3. Start Next.js Frontend on 127.0.0.1:3000
cd /home/dsriubatac/Bus-tracking/frontend
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nohup /home/dsriubatac/.nvm/versions/node/v20.20.2/bin/node node_modules/next/dist/bin/next start -p 3000 </dev/null > /home/dsriubatac/frontend.log 2>&1 &
disown -a

sleep 2
echo "Services started successfully!"
