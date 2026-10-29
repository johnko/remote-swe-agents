# ESM Import Validation Guide for Lambda Functions

## Problem

Lambda functions use Node.js with strict ESM module resolution, which requires explicit `.js` file extensions for all relative imports. Without them, functions fail at runtime with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/packages/agent-core/dist/schema/events'
```

## Solution: Automated ESM Validation

We use npm scripts to validate ESM imports work correctly during the build process, catching issues before they reach production.

### 1. For `@remote-swe-agents/agent-core`

The agent-core package includes built-in ESM validation:

```bash
# Validate ESM imports work (run after build)
npm run validate:esm --workspace packages/agent-core

# Build with validation
npm run build:validate --workspace packages/agent-core
```

**Output when passing:**
```
✓ Schema module imports correctly
✓ Exports: 52 symbols
✓ ESM validation passed
```

### 2. For Lambda Dockerfiles

All Lambda Dockerfiles should use `build:validate` instead of plain `build`:

```dockerfile
FROM public.ecr.aws/lambda/nodejs:22 AS builder
...
# ✓ GOOD: Validates ESM imports during build
RUN cd packages/agent-core && npm run build:validate

# ✗ BAD: No validation
RUN cd packages/agent-core && npm run build
```

And validate again in the runner stage with production dependencies:

```dockerfile
FROM public.ecr.aws/lambda/nodejs:22 AS runner
...
RUN cd packages/agent-core && npm run validate:esm
```

### 3. For New Lambda Functions

When creating a new Lambda function that imports from `@remote-swe-agents/agent-core`:

1. **Update the Dockerfile** to use `npm run build:validate`
2. **Test locally without Docker** (for development):
   ```bash
   # After building
   npm run build --workspace packages/agent-core
   npm run validate:esm --workspace packages/agent-core
   ```

### 4. Local Development (Without Docker)

Developers without Docker can test ESM imports directly:

```bash
# After building agent-core
cd packages/agent-core
npm run validate:esm

# Or manually
node --input-type=module --eval "import('./dist/schema/index.js').then(m => console.log('✓ Imports work'))"
```

### 5. Preventing Regressions

When modifying files in `packages/agent-core/src/schema/`:

- Always ensure imports include `.js` extensions
- Run `npm run validate:esm` before committing
- The Docker build will catch it if you forget

**Example (correct):**
```typescript
import { agentStatusSchema } from './agent.js';  // ✓ Has .js
```

**Example (incorrect):**
```typescript
import { agentStatusSchema } from './agent';     // ✗ Missing .js
```

### 6. Available Scripts

In `packages/agent-core/package.json`:

- `npm run build` - TypeScript compilation only
- `npm run build:validate` - Compile + validate ESM imports
- `npm run validate:esm` - Validate without recompiling
- `npm run test` - Run unit tests
- `npm run format` - Format code
- `npm run format:check` - Check formatting

### 7. Troubleshooting

**Q: "Unexpected: too few exports" error**
- Agent-core's schema module should export ~50+ symbols
- If count is too low, a module may not be compiling correctly
- Check TypeScript build errors

**Q: "Cannot find module" error**
- Missing `.js` extension in an import
- Search for `from '.` in `src/schema/` files
- Add `.js` extensions to all relative imports

**Q: Build passes locally but fails in Docker**
- Ensure `npm ci` (not `npm install`) is used in Docker
- The validation runs differently with clean installs
- Run `npm ci` locally to match Docker exactly

---

## Related Documentation

- **PR #80**: Core fix for ESM imports (all `.js` extensions added)
- **PR #81**: Build improvements (validation scripts added)
- Error that triggered this: Lambda session deletion failing with `ERR_MODULE_NOT_FOUND`
