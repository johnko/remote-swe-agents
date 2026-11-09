FROM public.ecr.aws/docker/library/node:24.22.2-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm audit --audit-level=low
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM public.ecr.aws/docker/library/node:24.22.2-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 8080 9000
CMD ["node", "dist/index.js"]
