#!/bin/bash
export PATH="/home/dsriubatac/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin"
export PM2_HOME="/home/dsriubatac/.pm2"

if ! /home/dsriubatac/.nvm/versions/node/v20.20.2/bin/pm2 ping > /dev/null 2>&1; then
    echo "[$(date)] PM2 down. Resurrecting..." >> /home/dsriubatac/keepalive.log
    /home/dsriubatac/.nvm/versions/node/v20.20.2/bin/pm2 resurrect >> /home/dsriubatac/keepalive.log 2>&1
fi
