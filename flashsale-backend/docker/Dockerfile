FROM node:20-bookworm-slim AS base

WORKDIR /usr/src/app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

FROM base AS build

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm prisma:generate && pnpm build

FROM base AS prod-deps

ENV NODE_ENV=production
ENV HUSKY=0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY prisma ./prisma
RUN pnpm prisma:generate

FROM base AS runtime

ENV NODE_ENV=production

COPY --from=build /usr/src/app/package.json ./package.json
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/dist ./dist

EXPOSE 5686

CMD ["node", "dist/main.js"]
