#!/bin/sh
cd "$(dirname "$0")"
PORT=3000
if [ -f config.json ]; then
  PORT=$(node -e "try{const c=require('./config.json');console.log(c.port||3000)}catch(e){console.log(3000)}" 2>/dev/null) || true
fi
export PORT
echo "Starting WorkScore on port $PORT..."
exec node --experimental-sqlite dist/main.js
