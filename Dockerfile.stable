FROM node:18 as base

RUN corepack enable && corepack prepare pnpm@8.7.1 --activate

FROM base AS deps

WORKDIR /app

COPY ./package.json ./pnpm-lock.yaml* ./

RUN pnpm config set store-dir .pnpm-store

RUN pnpm install

FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules    

CMD ["node", "dist/index.js"]