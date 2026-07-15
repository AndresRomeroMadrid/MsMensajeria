FROM node:22-alpine3.20 AS builder

WORKDIR /usr/app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./

COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:22-alpine3.20

WORKDIR /app

RUN corepack enable

COPY --from=builder /usr/app/dist ./dist

COPY --from=builder /usr/app/package.json /usr/app/pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

CMD ["node", "dist/index.js"]
