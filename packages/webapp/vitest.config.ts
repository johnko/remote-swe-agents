import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// agent-core's package.json `exports` map only points at the compiled `./dist`
// tree, which is not built during local/CI webapp test runs. Alias the
// published subpaths to agent-core's TypeScript source so vitest can resolve
// (and transform) them without requiring a prior build step.
const agentCoreSrc = (subpath: string) => fileURLToPath(new URL(`../agent-core/src/${subpath}`, import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@remote-swe-agents/agent-core/lib', replacement: agentCoreSrc('lib/index.ts') },
      { find: '@remote-swe-agents/agent-core/types/sender', replacement: agentCoreSrc('types/sender.ts') },
      { find: '@remote-swe-agents/agent-core/aws', replacement: agentCoreSrc('lib/aws/index.ts') },
      { find: '@remote-swe-agents/agent-core/schema', replacement: agentCoreSrc('schema/index.ts') },
      { find: '@remote-swe-agents/agent-core/tools', replacement: agentCoreSrc('tools/index.ts') },
      { find: '@remote-swe-agents/agent-core/tool-name-utils', replacement: agentCoreSrc('tool-name-utils/index.ts') },
      { find: '@remote-swe-agents/agent-core/mcp-server', replacement: agentCoreSrc('mcp-server/index.ts') },
    ],
  },
});
