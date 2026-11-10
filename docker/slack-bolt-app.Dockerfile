FROM public.ecr.aws/lambda/nodejs:24 AS builder
WORKDIR /build
COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/slack-bolt-app/package*.json ./packages/slack-bolt-app/
RUN npm ci
COPY ./ ./
# Build and validate agent-core (catches ESM import issues early)
RUN cd packages/agent-core && npm run build:validate
# Bundle and validate slack-bolt-app
RUN cd packages/slack-bolt-app && npm run bundle:validate

FROM public.ecr.aws/lambda/nodejs:24 AS runner

COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/slack-bolt-app/package*.json ./packages/slack-bolt-app/
RUN npm ci --omit=dev
# Copy built artifacts from builder stage
COPY --from=builder /build/packages/agent-core/dist ./packages/agent-core/dist
COPY --from=builder /build/packages/slack-bolt-app/dist/. ./
# Final validation: verify agent-core ESM imports work with production dependencies
RUN cd packages/agent-core && npm run validate:esm

CMD ["lambda.handler"]
