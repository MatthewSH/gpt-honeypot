FROM oven/bun:1.2-alpine

WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY . .

ENV NODE_ENV=production
CMD ["bun", "run", "start"]
