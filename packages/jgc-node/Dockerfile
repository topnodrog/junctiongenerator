FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22.23.2-bookworm-slim AS runtime
# This image's entrypoint is the simulation-receipt testnet launcher. Labeling
# it as production would correctly activate the fail-closed simnet guard.
ENV NODE_ENV=testnet
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 19444 7777
# The container binds the status listener to 0.0.0.0 for Docker port publishing,
# so the private /status route is deliberately disabled there. Use the narrow
# public liveness route instead; it exposes no wallet, role or operator data.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7777/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/scripts/testnet-node.js"]
CMD ["--host", "0.0.0.0", "--status-host", "0.0.0.0", "--datadir", "/data"]
