#!/bin/bash
# ==============================================================================
# UBus Server Diagnostic Script
# ==============================================================================
echo "==================== [1] GIT STATUS ===================="
cd /home/dsriubatac/Bus-tracking 2>/dev/null || cd "$HOME/Bus-tracking"
git rev-parse --short HEAD
git status -s

echo "==================== [2] LISTENING PORTS ===================="
ss -tlpn 2>/dev/null | grep -E "3000|3001|8000" || netstat -tlpn 2>/dev/null | grep -E "3000|3001|8000" || true

echo "==================== [3] USER PROCESSES ===================="
ps -u "$(whoami)" -o pid,stat,cmd | grep -E "node|next|gunicorn" | grep -v grep || true

echo "==================== [4] DOCUMENT ROOT ===================="
ls -la /home/dsriubatac/ubus.dsr.iubat.ac.bd/ 2>/dev/null || true

echo "==================== [5] .HTACCESS ===================="
cat /home/dsriubatac/ubus.dsr.iubat.ac.bd/.htaccess 2>/dev/null || true

echo "==================== [6] LOCAL PORT 3000 (Next.js) ===================="
curl -sI http://127.0.0.1:3000/ | head -n 15 || echo "Port 3000 unreachable"

echo "==================== [7] LOCAL PORT 3001 (Gateway) ===================="
curl -sI http://127.0.0.1:3001/ | head -n 15 || echo "Port 3001 unreachable"

echo "==================== [8] LOCAL PORT 8000 (Django) ===================="
curl -sI http://127.0.0.1:8000/api/ | head -n 15 || echo "Port 8000 unreachable"

echo "==================== [9] FRONTEND LOG ===================="
tail -n 20 /home/dsriubatac/frontend.log 2>/dev/null || echo "No frontend.log found"

echo "==================== [10] GATEWAY LOG ===================="
tail -n 20 /home/dsriubatac/gateway.log 2>/dev/null || echo "No gateway.log found"
