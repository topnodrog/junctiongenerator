FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY dist ./dist
COPY deploy/monitor/package.json deploy/monitor/package-lock.json ./deploy/monitor/
RUN cd deploy/monitor && npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY deploy/monitor/server.mjs deploy/monitor/review.mjs ./deploy/monitor/
USER node
CMD ["node", "deploy/monitor/server.mjs"]
