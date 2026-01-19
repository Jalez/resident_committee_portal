# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (including dev dependencies for build)
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Environment variables must be present at build time if they are baked in
# (e.g., public keys). If using runtime env vars, this is fine.
RUN bun run build

# Production image
FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json

# Install only production dependencies
COPY --from=deps /app/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --production

# Expose the port the app runs on
EXPOSE 3000

# Start the server
CMD ["bun", "run", "start"]