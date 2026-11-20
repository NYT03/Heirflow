# ==========================================
# HeirFlow — Google Cloud Run Multi-Stage Dockerfile
# Serves Backend API and Frontend in a single container
# ==========================================

# --- Stage 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production Server ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install Python & build tools for better-sqlite3 native compilation on Alpine
RUN apk add --no-cache python3 make g++ sqlite

# Install Backend dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./

# Copy compiled frontend build from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose Google Cloud Run default port
EXPOSE 8080

# Start HeirFlow server
CMD ["node", "server.js"]

