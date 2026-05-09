# Dockerfile para GestãoPro - Next.js + tRPC + Prisma
FROM node:20-alpine AS base

# Instalar dependências necessárias para Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Configurar Puppeteer para usar Chromium do Alpine
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# ─────────────────────────────────────────────────────────────
# DEPENDENCIES STAGE - Instalar dependências
# ─────────────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# ─────────────────────────────────────────────────────────────
# BUILD STAGE - Build da aplicação
# ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copiar dependências instaladas
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fonte
COPY . .

# Copiar schema do Prisma
COPY Prisma/schema.prisma ./Prisma/

# Gerar cliente Prisma
RUN npx prisma generate

# Build da aplicação
RUN npm run build

# ─────────────────────────────────────────────────────────────
# PRODUCTION STAGE - Imagem final otimizada
# ─────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar arquivos necessários
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copiar node_modules de produção
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copiar schema e migrations do Prisma
COPY --from=builder --chown=nextjs:nodejs /app/Prisma ./Prisma

# Copiar script do worker se existir
COPY --from=builder --chown=nextjs:nodejs /app/src/workers ./src/workers

# Mudar para usuário não-root
USER nextjs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Comando para iniciar a aplicação
CMD ["node", "server.js"]