FROM node:18.20.8-bookworm-slim

WORKDIR /app

RUN groupadd --system bridge && useradd --system --gid bridge --create-home --home-dir /home/bridge bridge

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY lib ./lib
COPY bin ./bin

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

USER bridge
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
