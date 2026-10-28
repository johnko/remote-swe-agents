FROM public.ecr.aws/lambda/nodejs:22 AS builder
WORKDIR /build
COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/webapp/package*.json ./packages/webapp/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY ./ ./
RUN cd packages/agent-core && npm run build
# Verify dist was created
RUN ls -la packages/agent-core/dist/lib/aws/ || echo "ERROR: aws directory not found!"
RUN cd packages/webapp && npx esbuild src/jobs/*.ts --bundle --outdir=dist --platform=node --format=esm --out-extension:.js=.mjs --charset=utf8 --packages=external

FROM public.ecr.aws/lambda/nodejs:22 AS runner

COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/webapp/package*.json ./packages/webapp/
COPY --from=builder /build/packages/agent-core/dist ./packages/agent-core/dist
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
# Verify dist files exist after npm ci
RUN ls -la packages/agent-core/dist/lib/ || echo "ERROR: dist/lib not found!"
RUN ls -la packages/agent-core/dist/lib/aws/ || echo "ERROR: dist/lib/aws not found!"
COPY --from=builder /build/packages/webapp/dist/. ./

CMD ["async-job-runner.mjs.handler"]
