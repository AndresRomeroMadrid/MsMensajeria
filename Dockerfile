FROM node:22-alpine3.20 AS builder

WORKDIR /usr/app

COPY package*.json ./

COPY tsconfig.json ./

RUN npm install

COPY . .

RUN npm run build

FROM node:22-alpine3.20

WORKDIR /app

COPY --from=builder /usr/app/dist ./dist

COPY --from=builder /usr/app/package*.json ./

RUN npm install --omit=dev

CMD ["node", "dist/index.js"]
