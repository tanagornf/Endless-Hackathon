# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim

# OS packages (ทั้งหมดที่ runtime ต้องใช้):
#  - fontconfig + fonts-thai-tlwg + fonts-noto-core : เซิร์ฟเวอร์วาดข้อความไทยเป็น PNG ด้วย sharp (รูปสินค้าเดโม, สลิปสังเคราะห์ F14/F37)
#    ไม่มีฟอนต์ไทย = ตัวอักษรเป็นสี่เหลี่ยม  (fonts-noto-core มี Noto Sans Thai; fonts-thai-tlwg มี Garuda/Loma/Norasi ฯลฯ)
#  - ca-certificates : TLS ไป OpenAI/LINE/Meta/Google
#  - util-linux (setpriv) มีอยู่ใน image แล้ว ใช้ใน entrypoint เพื่อ drop สิทธิ์
# sharp ใช้ binary สำเร็จรูป (linux-x64 glibc, มี libvips ในตัว) ไม่ต้องลง libvips/build-essential
# pdfjs-dist เป็น JS ล้วน · Playwright browsers ไม่อยู่ใน image (smoke รันจากเครื่องคน)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-thai-tlwg fonts-noto-core \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# build-time ของ Vite (ค่า public เท่านั้น, ห้ามมี secret ใน VITE_*)
ARG VITE_API_BASE=/api/v1
ARG VITE_WS_PATH=/ws
ARG VITE_DEV_LOGIN=1
ARG VITE_VAPID_PUBLIC_KEY=
ENV VITE_API_BASE=$VITE_API_BASE VITE_WS_PATH=$VITE_WS_PATH VITE_DEV_LOGIN=$VITE_DEV_LOGIN VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 NPM_CONFIG_UPDATE_NOTIFIER=false

# ติดตั้ง dependency (รวม dev: ต้องใช้ tsx + vite + typescript) ก่อน copy source เพื่อให้ layer cache ทำงาน
# COPY . . ก่อน npm ci: ถูกต้องกับทุกรูป workspace (cache layer เสียไป แต่ build รอบแรกแค่ไม่กี่นาที)
COPY . .
RUN npm ci --include=dev

# build web bundle (script นี้รัน typecheck ก่อน vite build: typecheck พัง = deploy ล้ม ซึ่งตั้งใจ)
RUN npm run build

ENV NODE_ENV=production
# Render ตั้ง PORT ให้เอง (default 10000) · local docker run ใช้ -e PORT=3000
EXPOSE 10000

# entrypoint เริ่มเป็น root เพื่อ chown ของ disk ที่ mount (disk มักเป็นของ root) แล้ว drop เป็นผู้ใช้ node
RUN chmod +x scripts/docker-entrypoint.sh
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]

# ไม่บังคับ: Render ใช้ healthCheckPath ใน render.yaml; ตัวนี้ไว้ให้ docker run ในเครื่องตรวจได้
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||10000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
