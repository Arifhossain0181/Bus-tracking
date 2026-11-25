#!/bin/bash
# ==============================================================================
# UBus Server Diagnostic Script
# ==============================================================================
echo "==================== [1] GIT STATUS ===================="
cd /home/dsriubatac/Bus-tracking 2>/dev/null || cd "$HOME/Bus-tracking"
git rev-parse --short HEAD
git status -s

echo "==================== [2] LISTENING PORTS ===================="
ss -tlpn 2>/dev/null | grep -E "3000|3001|3005|8000" || netstat -tlpn 2>/dev/null | grep -E "3000|3001|3005|8000" || true

echo "==================== [3] USER PROCESSES ===================="
ps -u "$(whoami)" -o pid,stat,cmd | grep -E "node|next|gunicorn" | grep -v grep || true

echo "==================== [4] DOCUMENT ROOT ===================="
ls -la /home/dsriubatac/ubus.dsr.iubat.ac.bd/ 2>/dev/null || true

echo "==================== [5] .HTACCESS ===================="
cat /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess 2>/dev/null || true

echo "==================== [6] LOCAL PORT 3005 (Next.js Dedicated) ===================="
curl -sI http://127.0.0.1:3005/ | head -n 15 || echo "Port 3005 unreachable"

echo "==================== [7] LOCAL PORT 8000 (Django) ===================="
curl -sI http://127.0.0.1:8000/ | head -n 15 || echo "Port 8000 unreachable"

echo "==================== [8] FRONTEND LOG ===================="
tail -n 25 /home/dsriubatac/frontend.log 2>/dev/null || echo "No frontend.log found"
