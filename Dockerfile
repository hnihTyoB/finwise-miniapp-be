# --- BUILD STAGE ---
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Prisma requires OpenSSL for its query engine.
RUN apk add --no-cache openssl

# Enable corepack to use pnpm defined in package.json
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy package descriptors first to leverage Docker layer caching
COPY package.json pnpm-lock.yaml ./
COPY prisma/schema.prisma ./prisma/
COPY scripts/prisma-run.js ./scripts/prisma-run.js

# Install all dependencies (including devDependencies)
RUN pnpm install --frozen-lockfile

# Generate Prisma Client
RUN pnpm run prisma:generate

# Copy source code and config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript code to JavaScript (outputs to dist/)
RUN pnpm run build

# --- RUNTIME STAGE ---
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Prisma requires OpenSSL for its query engine.
RUN apk add --no-cache openssl

# Enable corepack to use pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Set runtime environment
ENV NODE_ENV=production
ENV PORT=8888

# Create storage directory for local receipts
RUN mkdir -p storage/receipts && chown -R node:node storage

# Copy package descriptors
COPY package.json pnpm-lock.yaml ./
COPY prisma/ ./prisma/

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy compiled files from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Use non-root node user for security hardening
USER node

# Expose port
EXPOSE 8888

# Execute migrations deploy and start application
CMD ["pnpm", "start"]
