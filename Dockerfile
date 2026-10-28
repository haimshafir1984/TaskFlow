FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3012
ENV HOST=0.0.0.0
ENV TASKFLOW_DATA_DIR=/var/lib/taskflow/data

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /var/lib/taskflow/data \
  && chown -R node:node /app /var/lib/taskflow

USER node

EXPOSE 3012

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3012/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/web/server.js"]
