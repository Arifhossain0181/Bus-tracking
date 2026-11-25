#!/bin/bash
set -e

# Acquire deployment lock so keepalive watchdog does not trigger during build
touch /tmp/ubus_updating.lock
trap 'rm -f /tmp/ubus_updating.lock' EXIT

echo "==========================================="
echo "   UBus Auto-Updater & Deployment Script   "
echo "==========================================="

# 1. Pull latest code from GitHub
cd /home/dsriubatac/Bus-tracking
echo "[1/4] Pulling latest code from GitHub (hij_dev)..."
git fetch origin hij_dev
git reset --hard origin/hij_dev
git clean -fd

# 2. Backend updates
echo "[2/4] Updating Backend (Dependencies, Migrations, Static)..."
cd /home/dsriubatac/Bus-tracking/backend
source venv/bin/activate
pip install -r requirements.txt --quiet
python manage.py migrate --noinput
python manage.py seed_production_routes
python manage.py snap_routes_to_roads
python manage.py collectstatic --noinput

# 3. Clean DocumentRoot of any stale files and ensure clean .htaccess
if [ -d "/home/dsriubatac/ubus.dsr.iubat.ac.bd" ]; then
  echo "-> Cleaning DocumentRoot of stale static files..."
  rm -f /home/dsriubatac/ubus.dsr.iubat.ac.bd/index.html
  rm -f /home/dsriubatac/ubus.dsr.iubat.ac.bd/index.htm
  rm -rf /home/dsriubatac/ubus.dsr.iubat.ac.bd/_next
  rm -rf /home/dsriubatac/ubus.dsr.iubat.ac.bd/.next

  cat << 'EOF' > /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess
DirectoryIndex disabled
RewriteEngine On
RewriteBase /

# 1. Django API, Admin & Static -> port 8000
RewriteRule ^api/(.*)$ http://127.0.0.1:8000/api/$1 [P,L,QSA]
RewriteRule ^admin/(.*)$ http://127.0.0.1:8000/admin/$1 [P,L,QSA]
RewriteRule ^static/(.*)$ http://127.0.0.1:8000/static/$1 [P,L]
RewriteRule ^django-static/(.*)$ http://127.0.0.1:8000/static/$1 [P,L]

# 2. Next.js Frontend -> port 3000
RewriteRule ^(.*)$ http://127.0.0.1:3000/$1 [P,L,QSA]
EOF
  chmod 644 /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess
fi

# 4. Frontend updates
echo "[3/4] Updating Frontend (Dependencies & Rebuilding Next.js)..."
# Stop running frontend to release locks on .next directory
for p in 3000 3001 8000; do
  ss -lptn "sport = :$p" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | while read -r pid; do
    [ -n "$pid" ] && kill -9 "$pid" 2>/dev/null || true
  done
done
pkill -9 -u "$(whoami)" -f node 2>/dev/null || true
pkill -9 -u "$(whoami)" -f "next-server" 2>/dev/null || true
sleep 1

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
cd /home/dsriubatac/Bus-tracking/frontend
echo "-> Purging stale build cache..."
rm -rf .next
if [ ! -d "node_modules" ]; then
  echo "-> Installing frontend dependencies..."
  npm install --prefer-offline --no-audit --no-fund
fi
echo "-> Compiling Next.js production build..."
npm run build

# 5. Restart services
echo "[4/4] Restarting Services in persistent background mode..."
chmod +x /home/dsriubatac/Bus-tracking/keepalive.sh 2>/dev/null || true
chmod +x /home/dsriubatac/Bus-tracking/start_services.sh 2>/dev/null || true
bash /home/dsriubatac/Bus-tracking/start_services.sh

# Touch Passenger restart files in case cPanel Phusion Passenger is supervising
mkdir -p /home/dsriubatac/Bus-tracking/frontend/tmp 2>/dev/null || true
touch /home/dsriubatac/Bus-tracking/frontend/tmp/restart.txt 2>/dev/null || true
mkdir -p /home/dsriubatac/ubus.dsr.iubat.ac.bd/tmp 2>/dev/null || true
touch /home/dsriubatac/ubus.dsr.iubat.ac.bd/tmp/restart.txt 2>/dev/null || true
mkdir -p /home/dsriubatac/Bus-tracking/tmp 2>/dev/null || true
touch /home/dsriubatac/Bus-tracking/tmp/restart.txt 2>/dev/null || true

# Setup convenient 1-word aliases in ~/.bashrc if not already present
if [ -f "$HOME/.bashrc" ] && ! grep -q "alias deploy=" "$HOME/.bashrc" 2>/dev/null; then
  echo "alias deploy='bash /home/dsriubatac/Bus-tracking/update.sh'" >> "$HOME/.bashrc"
  echo "alias ubus-update='bash /home/dsriubatac/Bus-tracking/update.sh'" >> "$HOME/.bashrc"
fi
ln -sf /home/dsriubatac/Bus-tracking/update.sh /home/dsriubatac/deploy.sh 2>/dev/null || true
ln -sf /home/dsriubatac/Bus-tracking/update.sh /home/dsriubatac/update.sh 2>/dev/null || true

# Remove lock
rm -f /tmp/ubus_updating.lock

echo "==========================================="
echo "   UBus Deployment Completed Successfully! "
echo "==========================================="
