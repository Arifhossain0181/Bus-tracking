#!/bin/bash
set -e

echo "==========================================="
echo "   UBus Auto-Updater & Deployment Script   "
echo "==========================================="

# 1. Pull latest code from GitHub
cd /home/dsriubatac/Bus-tracking
echo "[1/4] Pulling latest code from GitHub..."
git fetch origin hij_dev
git reset --hard origin/hij_dev

# 2. Backend updates
echo "[2/4] Updating Backend (Dependencies, Migrations, Static)..."
cd /home/dsriubatac/Bus-tracking/backend
source venv/bin/activate
pip install -r requirements.txt --quiet
python manage.py makemigrations --noinput
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
echo "[4/4] Restarting PM2 Services..."
if ! pm2 restart all 2>/dev/null; then
    echo "Processes not running in memory. Resurrecting or starting fresh..."
    pm2 resurrect 2>/dev/null || true
    if ! pm2 describe ubus-backend >/dev/null 2>&1; then
        pm2 start /home/dsriubatac/Bus-tracking/backend/run_backend.sh --name ubus-backend --interpreter bash
    fi
    if ! pm2 describe ubus-frontend >/dev/null 2>&1; then
        pm2 start npm --name ubus-frontend --cwd /home/dsriubatac/Bus-tracking/frontend -- start -- -p 3000
    fi
    pm2 save
fi

echo "==========================================="
echo "   Update Completed Successfully!          "
echo "==========================================="
