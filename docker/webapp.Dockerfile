FROM public.ecr.aws/lambda/nodejs:22 AS builder
WORKDIR /build
COPY package*.json ./
COPY ./patches ./patches
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/webapp/package*.json ./packages/webapp/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY ./ ./
# Build and validate agent-core (catches ESM import issues early)
RUN cd packages/agent-core && npm run build:validate

ARG SKIP_TS_BUILD=""
ARG ALLOWED_ORIGIN_HOST=""
ARG NEXT_PUBLIC_EVENT_HTTP_ENDPOINT=""
ARG NEXT_PUBLIC_AWS_REGION=""
ARG NEXT_PUBLIC_BEDROCK_CRI_REGION_OVERRIDE=""
ENV USER_POOL_CLIENT_ID="dummy"
ENV USER_POOL_ID="dummy"
ENV APP_ORIGIN="https://dummy.example.com"
ENV COGNITO_DOMAIN="dummy.example.com"
RUN --mount=type=cache,target=/build/packages/webapp/.next/cache cd packages/webapp && npm run build

FROM public.ecr.aws/lambda/nodejs:22 AS runner
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter
ENV AWS_LWA_PORT=3000
ENV AWS_LWA_READINESS_CHECK_PATH="/api/health"
ENV AWS_LWA_INVOKE_MODE="response_stream"

COPY --from=builder /build/packages/webapp/.next/standalone ./
COPY --from=builder /build/packages/webapp/.next/static ./packages/webapp/.next/static
COPY --from=builder /build/packages/webapp/public ./packages/webapp/public
COPY --from=builder /build/packages/webapp/run.sh ./run.sh

RUN ln -s /tmp/cache ./packages/webapp/.next/cache

# Copy agent-core dist and validate ESM imports work with production dependencies
COPY --from=builder /build/packages/agent-core/dist ./packages/agent-core/dist
COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
RUN cd packages/agent-core && npm run validate:esm

ENTRYPOINT ["sh"]
CMD ["run.sh"]
