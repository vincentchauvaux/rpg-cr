FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm install

FROM deps AS build
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
COPY . .
RUN npm run build -w @rpg-cr/shared
RUN npm run build -w @rpg-cr/api
RUN npm run build -w @rpg-cr/web

FROM base AS api
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/rpg-cr.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
RUN mkdir -p /data/avatars
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]

FROM base AS web
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages/shared ./packages/shared
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "start"]
