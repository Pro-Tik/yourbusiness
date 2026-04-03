FROM node:20-slim

# sqlite3 native addon needs python3 + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --build-from-source

# Copy source files
COPY . .

# Entrypoint: run the campaign loop script
CMD ["node", "campaign_loop.js"]
