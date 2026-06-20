FROM oven/bun:1.2-alpine AS build

WORKDIR /app
COPY package.json tsconfig.json ./
RUN bun install
COPY src ./src
RUN bun run ci

FROM oven/bun:1.2-alpine

WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown -R app:app /app
COPY --from=build --chown=app:app /app/dist ./dist
USER app
CMD ["bun", "dist/index.js"]
