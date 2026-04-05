FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg font-noto fontconfig

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

# Development target
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:/data/dev.db"
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy 2>/dev/null; npx prisma db push && npx prisma generate && npm run dev"]

# Build for production
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:/data/dev.db"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# Production target
FROM base AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/dev.db"
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && node server.js"]
