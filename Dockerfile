FROM node:20-slim

WORKDIR /app

# Install build tools for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create persistent directories
RUN mkdir -p /app/data /app/uploads

# Expose port (Railway sets PORT env var)
EXPOSE ${PORT:-3001}

# Seed database and start server
CMD ["sh", "-c", "node src/utils/seed.js && node src/server.js"]
