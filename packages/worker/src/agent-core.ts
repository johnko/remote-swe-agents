// API implementation for agent core runtime
// https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html

import express from 'express';
import { main } from './entry';
import { updateInstanceStatus } from '@remote-swe-agents/agent-core/lib';
import { setProcessRuntimeType } from './runtime-type';
import { readFileSync } from 'fs';
import { join } from 'path';

setProcessRuntimeType('agent-core');

// Version validation regex - allow alphanumeric, hyphens, dots, underscores
const VALID_VERSION_REGEX = /^[a-zA-Z0-9._-]{1,64}$/;

const sanitizeVersion = (version: string): string => {
  if (!version || typeof version !== 'string') {
    return 'unknown';
  }
  const trimmed = version.trim();
  if (!VALID_VERSION_REGEX.test(trimmed)) {
    console.warn(`[agent-core] Invalid version format, using 'unknown'`);
    return 'unknown';
  }
  return trimmed;
};

const workerVersion = (() => {
  try {
    const versionContent = readFileSync(join(__dirname, '../.build-version'), 'utf-8');
    return sanitizeVersion(versionContent);
  } catch (e) {
    console.error('[agent-core] Failed to read .build-version:', e);
    try {
      const pkgContent = readFileSync(join(__dirname, '../package.json'), 'utf-8');
      const parsed = JSON.parse(pkgContent);
      // Validate parsed version
      if (parsed && typeof parsed.version === 'string' && VALID_VERSION_REGEX.test(parsed.version)) {
        return `pkg-${sanitizeVersion(parsed.version)}`;
      }
      return 'unknown';
    } catch (e2) {
      console.error('[agent-core] Failed to read package.json:', e2);
      return 'unknown';
    }
  }
})();
console.log(`[agent-core] starting (version=${workerVersion}, pid=${process.pid})`);

let getCurrentStatus: () => 'busy' | 'idle' | undefined;
const app = express();

app.use(express.json());

app.post('/invocations', async (req, res) => {
  const body = req.body;
  console.log(body);
  const sessionId = body.sessionId;

  // Store the agent runtime ARN passed from the invoker for later use (e.g. StopRuntimeSession)
  if (body.agentRuntimeArn) {
    process.env.AGENT_RUNTIME_ARN = body.agentRuntimeArn;
  }

  const tracker = await main(sessionId);
  if (tracker) {
    getCurrentStatus = () => (tracker.isBusy() ? 'busy' : 'idle');
  }

  // Always update instance status to 'running' on invocation,
  // even if the session was already started (e.g. after stop→resume)
  await updateInstanceStatus(sessionId, 'running');

  res.json({
    response: 'ok',
    status: 'success',
  });
});

app.get('/ping', (_req, res) => {
  const status = getCurrentStatus?.() ?? 'idle';
  res.json({
    status: status == 'idle' ? 'Healthy' : 'HealthyBusy',
    time_of_last_update: Math.floor(Date.now() / 1000),
  });
});

const port = 8080;
app.listen(port, () => {
  console.log(`Agent server listening on 0.0.0.0:${port}`);
});
