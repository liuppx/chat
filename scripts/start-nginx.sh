#!/bin/bash
set -x

PORTS="80 443"

for port in $PORTS; do
    echo "Checking port $port..."
    PID=$(sudo lsof -ti tcp:$port)
    if [ -n "$PID" ]; then
        echo "Killing process on port $port (PID: $PID)"
        sudo kill -9 $PID
    else
        echo "No process found on port $port"
    fi
done
set +x
set -x
sudo cp ./scripts/https.conf /usr/share/nginx/chat.conf
sudo nginx -c /usr/share/nginx/chat.conf
set +x
