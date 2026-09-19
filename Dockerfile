FROM node:18-slim

# Install Chromium and ALL necessary system dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Allow Puppeteer to download its own perfectly compatible bundled Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_SKIP_DOWNLOAD=false

WORKDIR /app

# Install dependencies separately for caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app
COPY . .

# Ensure the .wwebjs_auth directory exists and is writable
RUN mkdir -p .wwebjs_auth && chmod -R 777 .wwebjs_auth

EXPOSE 5000

# Use startCommand from railway.json or define here
RUN apt-get update && apt-get install -y dbus-x11 xvfb && rm -rf /var/lib/apt/lists/*
CMD ["dbus-run-session", "node", "index.js"]
