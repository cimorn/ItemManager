# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
WORKDIR /build
RUN npm install --global pnpm@11.7.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN --mount=type=cache,id=itemmanager-web-pnpm,target=/pnpm/store \
    pnpm --filter @itemmanager/web install --frozen-lockfile --ignore-scripts --store-dir=/pnpm/store
COPY web/index.html web/vite.config.js ./web/
COPY web/src ./web/src
COPY web/scripts/runtime-deps.cjs ./web/scripts/runtime-deps.cjs
RUN pnpm --dir web build && node -e "require('./web/scripts/runtime-deps.cjs').vendorRuntimeDependencies({projectRoot:process.cwd()+'/web',targetDir:'/runtime/node_modules'}).catch(()=>process.exit(1))"

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production STORAGE_PORT=3000 STORAGE_HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=1000:10 /runtime/node_modules ./node_modules
COPY --from=build --chown=1000:10 /build/web/dist/renderer ./dist/renderer
COPY --chown=1000:10 web/server ./server
COPY --chown=1000:10 web/package.json ./package.json
COPY --chown=1000:10 LICENSE ./LICENSE
USER 1000:10
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
