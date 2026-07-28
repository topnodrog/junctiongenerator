FROM node:20.20.2-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.20.2-bookworm-slim AS runtime
# This image's entrypoint is the simulation-receipt testnet launcher. Labeling
# it as production would correctly activate the fail-closed simnet guard.
ENV NODE_ENV=testnet
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 19444 7777
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7777/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/scripts/testnet-node.js"]
CMD ["--host", "0.0.0.0", "--status-host", "0.0.0.0", "--datadir", "/data"]
