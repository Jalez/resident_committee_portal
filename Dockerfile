# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (including dev dependencies for build)
FROM base AS deps
COPY package.json bun.lock ./
RUN rm bun.lock && bun install

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Environment variables must be present at build time if they are baked in
# (e.g., public keys). If using runtime env vars, this is fine.
RUN bun run build

# Production image (using Node to run the server, as React Router v7 serve defaults to Node streams)
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install bun to resolve the lockfile for production dependencies
RUN npm install -g bun

COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=deps /app/bun.lock ./bun.lock

# Install only production dependencies
RUN rm bun.lock && bun install --production

# Expose the port the app runs on
EXPOSE 3000

# Start the server using npm (which uses Node.js for react-router-serve)
CMD ["npm", "run", "start"]