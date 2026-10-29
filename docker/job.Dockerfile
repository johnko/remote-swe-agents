FROM public.ecr.aws/lambda/nodejs:22 AS builder
WORKDIR /build
COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/webapp/package*.json ./packages/webapp/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY ./ ./
# Build agent-core and validate ESM imports work (catches module resolution issues early)
RUN cd packages/agent-core && npm run build:validate
RUN cd packages/webapp && npx esbuild src/jobs/*.ts --bundle --outdir=dist --platform=node --format=esm --out-extension:.js=.mjs --charset=utf8

FROM public.ecr.aws/lambda/nodejs:22 AS runner

COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/webapp/package*.json ./packages/webapp/
COPY --from=builder /build/packages/agent-core/dist ./packages/agent-core/dist
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
# Final validation: verify ESM imports work with production dependencies
RUN cd packages/agent-core && npm run validate:esm
COPY --from=builder /build/packages/webapp/dist/. ./

CMD ["async-job-runner.mjs.handler"]
