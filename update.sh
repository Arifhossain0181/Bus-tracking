#!/bin/bash
set -e

echo "==========================================="
echo "   UBus Auto-Updater & Deployment Script   "
echo "==========================================="

# 1. Pull latest code from GitHub
cd /home/dsriubatac/Bus-tracking
echo "[1/4] Pulling latest code from GitHub (hij_dev)..."
git fetch origin hij_dev
git reset --hard origin/hij_dev

# 2. Backend updates
echo "[2/4] Updating Backend (Dependencies, Migrations, Static)..."
cd /home/dsriubatac/Bus-tracking/backend
source venv/bin/activate
pip install -r requirements.txt --quiet
python manage.py migrate --noinput
python manage.py seed_production_routes
python manage.py snap_routes_to_roads
python manage.py collectstatic --noinput

# 3. Frontend updates
echo "[3/4] Updating Frontend (Dependencies & Rebuilding Next.js)..."
# Unconditionally stop running node processes to release locks on .next directory
killall -9 -u dsriubatac node 2>/dev/null || true
pkill -9 -u dsriubatac -x node 2>/dev/null || true
pkill -9 -u dsriubatac -f node 2>/dev/null || true
pkill -9 -u dsriubatac -f next 2>/dev/null || true
pkill -9 -u dsriubatac -f npm 2>/dev/null || true
for P in $(lsof -ti:3000 2>/dev/null); do kill -9 "$P" 2>/dev/null || true; done
/usr/sbin/fuser -k -9 3000/tcp 2>/dev/null || true
/sbin/fuser -k -9 3000/tcp 2>/dev/null || true
fuser -k -9 3000/tcp 2>/dev/null || true
sleep 1
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
cd /home/dsriubatac/Bus-tracking/frontend
# Wipe stale cache and compiled chunks to guarantee fresh hash manifests
rm -rf .next
if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm install --prefer-offline --no-audit --no-fund
fi
echo "Compiling Next.js production build..."
npm run build

# 4. Restart services
echo "[4/4] Restarting Services in persistent background mode..."
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
chmod +x /home/dsriubatac/Bus-tracking/keepalive.sh 2>/dev/null || true
chmod +x /home/dsriubatac/Bus-tracking/start_services.sh 2>/dev/null || true
bash /home/dsriubatac/Bus-tracking/start_services.sh

# Setup convenient 1-word aliases in ~/.bashrc if not already present
if [ -f "$HOME/.bashrc" ] && ! grep -q "alias deploy=" "$HOME/.bashrc" 2>/dev/null; then
  echo "alias deploy='bash /home/dsriubatac/Bus-tracking/update.sh'" >> "$HOME/.bashrc"
  echo "alias ubus-update='bash /home/dsriubatac/Bus-tracking/update.sh'" >> "$HOME/.bashrc"
fi
ln -sf /home/dsriubatac/Bus-tracking/update.sh /home/dsriubatac/deploy.sh 2>/dev/null || true
ln -sf /home/dsriubatac/Bus-tracking/update.sh /home/dsriubatac/update.sh 2>/dev/null || true

echo "==========================================="
echo "   UBus Deployment Completed Successfully! "
echo "==========================================="
