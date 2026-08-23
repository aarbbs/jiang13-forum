#!/bin/sh
set -e

# 宿主机 / 1Panel 挂载的 volume 常为 root 所有（uid 0），
# 而应用以 jiang13（uid 1000）运行，需在启动时修正 /data 权限后降权。

DATA_DIR="/data"

if [ "$(id -u)" = '0' ]; then
	mkdir -p "$DATA_DIR"
	chown -R jiang13:jiang13 "$DATA_DIR"
	exec su-exec jiang13 /app/jiang13 "$@"
fi

exec /app/jiang13 "$@"
