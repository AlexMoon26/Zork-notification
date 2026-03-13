# ---- Builder stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# ---- Production stage ----
FROM node:18-alpine

WORKDIR /app

# Копируем только необходимые файлы
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Порт, который слушает приложение (по умолчанию NestJS часто 3000)
EXPOSE 3000

# Запускаем
CMD ["node", "dist/main"]