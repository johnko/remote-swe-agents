FROM public.ecr.aws/lambda/nodejs:22 AS builder
WORKDIR /build
COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/webapp/package*.json ./packages/webapp/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY ./ ./
# Build agent-core and validate ESM imports work (catches module resolution issues early)
RUN cd packages/agent-core && npm run build:validate
RUN cd packages/webapp && npx esbuild src/jobs/*.ts --bundle --outdir=dist --platform=node --format=esm --out-extension:.js=.mjs --charset=utf8 --packages=external

FROM public.ecr.aws/lambda/nodejs:22 AS runner

COPY package*.json ./
COPY packages/agent-core/package*.json ./packages/agent-core/
COPY packages/webapp/package*.json ./packages/webapp/
COPY --from=builder /build/packages/agent-core/dist ./packages/agent-core/dist
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --from=builder /build/packages/webapp/dist/. ./

# Create a CommonJS wrapper file that re-exports the ESM handler
COPY <<EOF handler.cjs
// Dynamic import wrapper for ESM module in CommonJS context
let _handler = null;
let _loading = null;

async function loadHandler() {
  if (_handler) return _handler;
  if (_loading) return _loading;
  
  _loading = import('./async-job-runner.mjs').then(m => {
    _handler = m.handler;
    return _handler;
  });
  
  return _loading;
}

// Export a handler that loads and delegates to the ESM handler
module.exports.handler = async (event, context) => {
  const handler = await loadHandler();
  return handler(event, context);
};
EOF

CMD ["handler.cjs"]
