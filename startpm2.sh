#!/usr/bin/env bash
export NVM_DIR="${HOME}/.nvm"
[ -s "$NVM_DIR/nvm.sh"   ] && . "$NVM_DIR/nvm.sh"  # This loads nvm
"${HOME}/.nvm/versions/node/$(nvm current)/bin/pm2" start "${HOME}/RobotWebService/pm2Config.json"
