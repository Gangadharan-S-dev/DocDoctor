# DocDoctor conversion service — Express + LibreOffice headless.
# Build:  docker build -t docdoctor-server server/
# Run:    docker run --rm -p 8080:8080 docdoctor-server
# Then point the web app at it with VITE_API_URL (or proxy /api to :8080).
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-impress libreoffice-writer libreoffice-calc fonts-liberation ghostscript qpdf \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

ENV PORT=8080 HOST=0.0.0.0
# The service binds all interfaces inside the container; publish the port
# only to hosts/networks you trust, or front it with your platform's auth.
EXPOSE 8080
USER node
CMD ["node", "src/index.js"]
