# Production Dockerfile for Render / Container deployments
FROM node:20-bullseye-slim

WORKDIR /app

# Install native build tools for compiling better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package descriptors and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application source code
COPY . .

# Ensure frontend bundle is built
RUN npm run build

# Default environment
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "server/index.js"]
