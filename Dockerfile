FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/shared ./packages/shared
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

FROM node:22-alpine AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/packages/shared ./packages/shared
USER node
CMD ["node", "apps/worker/dist/index.js"]

FROM nginx:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infrastructure/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
