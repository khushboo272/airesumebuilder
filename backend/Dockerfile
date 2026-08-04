# Node.js Backend Dockerfile
FROM node:20-alpine AS base

# Create app directory
WORKDIR /usr/src/app

# Install dependencies (cached layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose backend API port
EXPOSE 5000

# Set environment defaults
ENV NODE_ENV=production \
    PORT=5000

# Use non-root user for security
USER node

# Health check endpoint verification
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Command to run application
CMD ["node", "src/server.js"]
