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
python manage.py collectstatic --noinput

# 3. Frontend updates
echo "[3/4] Updating Frontend (Dependencies & Rebuilding Next.js)..."
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
cd /home/dsriubatac/Bus-tracking/frontend
npm install --silent
npm run build

# 4. Restart services
echo "[4/4] Restarting Services in persistent background mode..."
if [ -f "/home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess" ]; then
  sed -i 's/8001/8000/g' /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess
fi
chmod +x /home/dsriubatac/Bus-tracking/start_services.sh 2>/dev/null || true
bash /home/dsriubatac/Bus-tracking/start_services.sh

echo "==========================================="
echo "   UBus Deployment Completed Successfully! "
echo "==========================================="
