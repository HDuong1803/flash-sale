# Multi-stage build for optimized image
FROM node:20-bookworm-slim AS base

# Install LibreOffice and fonts for document conversion
RUN apt-get update && apt-get install -y \
    libreoffice \
    libreoffice-writer \
    libreoffice-calc \
    fonts-liberation \
    fonts-liberation2 \
    fonts-noto-core \
    fonts-dejavu-core \
    openssl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Set working directory
WORKDIR /usr/src/app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build project
RUN pnpm build

# Expose port
EXPOSE 8080

# Start application
CMD ["pnpm", "start"]
