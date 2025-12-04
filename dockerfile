# Reusable image for all services
FROM node:20-alpine

WORKDIR /app

# Install deps (your package.json/lock are in backend/)
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy service code and static files
COPY backend/*.js ./backend/
# Your httpd-frontend serves from "<backend>/public", so place HTML there
COPY frontend/ ./backend/public/

ENV NODE_ENV=production

# Default process = httpd-frontend (override per-container)
EXPOSE 4006
CMD ["node", "backend/httpd-frontend.js"]