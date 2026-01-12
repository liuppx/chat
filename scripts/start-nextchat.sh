#!/bin/bash
set -x
#Next.js 应用监听的端口
PORT=3000

# 获取占用该端口的主进程 PID（通常是 next-server）
PID=$(lsof -ti tcp:$PORT)

if [ -n "$PID" ]; then
    echo "Killing process tree for PID $PID (port $PORT)..."
    sudo kill -9 $PID
    # 等待进程完全停止
    while ps -p $PID > /dev/null; do sleep 1; done
else
    echo "No process found on port $PORT"
fi
rm -rf node_modules .next
git pull
cp .env.template .env.local
npm install
npm run build
PORT=3000 nohup npm start > nextjs.log 2>&1 &
set +x