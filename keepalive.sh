#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

if ! pm2 ping > /dev/null 2>&1; then
    pm2 resurrect > /dev/null 2>&1
fi
