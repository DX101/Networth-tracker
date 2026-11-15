# Multi-stage Dockerfile for NetWorth Tracker
# Supports Render, Railway, Fly.io, and standard Docker environments
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package manifests first for caching
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies including devDependencies for build
RUN npm install

# Copy application source
COPY . .

# Build Vite frontend into client/dist
RUN npm run build:client

# Production runtime image
FROM node:18-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_DIR=/data

# Copy dependencies and build outputs
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

# Persistent volume mount for SQLite database
VOLUME ["/data"]

EXPOSE 3001

CMD ["node", "server/index.js"]
