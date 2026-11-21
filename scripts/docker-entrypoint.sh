#!/bin/sh
# เริ่มเป็น root → เตรียมโฟลเดอร์ upload บน disk → drop เป็นผู้ใช้ node แล้ว exec คำสั่งที่ได้รับ
# ใช้ได้ทั้ง start command และ preDeployCommand (preDeploy ไม่มี disk: mkdir ล้มได้ ไม่เป็นไร)
set -e
UPLOAD="${UPLOAD_DIR:-/var/data/uploads}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOAD" 2>/dev/null || true
  chown -R node:node "$UPLOAD" 2>/dev/null || true
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
