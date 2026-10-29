# ESM Import Validation Guide for Lambda Functions

## Problem

Lambda functions use Node.js with strict ESM module resolution, which requires explicit `.js` file extensions for all relative imports. Without them, functions fail at runtime with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/packages/agent-core/dist/schema/events'
```

## Solution: Automated Validation Across All Lambdas

We use npm scripts to validate imports work correctly during the build process, catching issues before they reach production.

### Lambda Functions with Validation

| Function | Dockerfile | Validation |
|----------|-----------|-----------|
| **job** | `docker/job.Dockerfile` | Agent-core ESM + production validation |
| **slack-bolt-app** | `docker/slack-bolt-app.Dockerfile` | Agent-core ESM + bundle handler export |
| **webapp** | `docker/webapp.Dockerfile` | Agent-core ESM + production validation |
| **agent** (worker) | `docker/agent.Dockerfile` | Agent-core ESM validation |

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

### 2. For slack-bolt-app Lambda

The slack-bolt-app has bundle validation:

```bash
# Validate bundled handler exports
npm run validate:bundle --workspace packages/slack-bolt-app

# Bundle with validation
npm run bundle:validate --workspace packages/slack-bolt-app
```

**Output when passing:**
```
✓ Lambda bundle valid
✓ Handler export found
```

### 3. For Lambda Dockerfiles

All Lambda Dockerfiles use validation scripts:

**job.Dockerfile:**
```dockerfile
# Builder: compile and validate ESM
RUN cd packages/agent-core && npm run build:validate

# Runner: re-validate with production dependencies
RUN cd packages/agent-core && npm run validate:esm
```

**slack-bolt-app.Dockerfile:**
```dockerfile
# Builder: build agent-core and bundle with validation
RUN cd packages/agent-core && npm run build:validate
RUN cd packages/slack-bolt-app && npm run bundle:validate

# Runner: final ESM validation
RUN cd packages/agent-core && npm run validate:esm
```

**webapp.Dockerfile:**
```dockerfile
# Builder: validate agent-core
RUN cd packages/agent-core && npm run build:validate

# Runner: copy dist and re-validate with production dependencies
COPY --from=builder /build/packages/agent-core/dist ./packages/agent-core/dist
RUN cd packages/agent-core && npm run validate:esm
```

**agent.Dockerfile:**
```dockerfile
# Build and validate agent-core
RUN cd packages/agent-core && npm run build:validate
```

### 4. Local Development (Without Docker)

Developers without Docker can test ESM imports directly:

```bash
# After building agent-core
cd packages/agent-core
npm run validate:esm

# For slack-bolt-app bundle
cd packages/slack-bolt-app
npm run bundle:validate

# Or manually
node --input-type=module --eval "import('./dist/schema/index.js').then(m => console.log('✓ Imports work'))"
```

### 5. For New Lambda Functions

When creating a new Lambda function that imports from `@remote-swe-agents/agent-core`:

1. **Update the Dockerfile:**
   ```dockerfile
   # Builder stage
   RUN cd packages/agent-core && npm run build:validate
   
   # Runner stage
   RUN cd packages/agent-core && npm run validate:esm
   ```

2. **Test locally without Docker:**
   ```bash
   npm run build --workspace packages/agent-core
   npm run validate:esm --workspace packages/agent-core
   ```

3. **If bundling, add validation:**
   ```json
   "scripts": {
     "bundle:validate": "npm run bundle && npm run validate:bundle"
   }
   ```

### 6. Available Scripts

**In `packages/agent-core/package.json`:**
- `npm run build` - TypeScript compilation only
- `npm run build:validate` - Compile + validate ESM imports
- `npm run validate:esm` - Validate without recompiling

**In `packages/slack-bolt-app/package.json`:**
- `npm run bundle` - esbuild bundling only
- `npm run bundle:validate` - Bundle + validate handler export
- `npm run validate:bundle` - Validate without re-bundling

### 7. Preventing Regressions

When modifying files in `packages/agent-core/src/schema/`:

- Always ensure imports include `.js` extensions
- Run `npm run validate:esm` before committing
- All Docker builds will catch it if you forget

**Example (correct):**
```typescript
import { agentStatusSchema } from './agent.js';  // ✓ Has .js
```

**Example (incorrect):**
```typescript
import { agentStatusSchema } from './agent';     // ✗ Missing .js
```

### 8. Troubleshooting

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

**Q: slack-bolt-app validation fails**
- Make sure esbuild has completed successfully
- Check that dist/lambda.js was created
- Verify the bundle contains export statements

---

## Related Documentation

- **PR #80**: Core fix for ESM imports (all `.js` extensions added)
- **PR #81**: Build improvements (validation scripts added to all Lambdas)
- Error that triggered this: Lambda session deletion failing with `ERR_MODULE_NOT_FOUND`

