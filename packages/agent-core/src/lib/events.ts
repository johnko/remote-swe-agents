import { SignatureV4 } from '@smithy/signature-v4';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import z from 'zod';
import { webappEventSchema } from '../schema/index.js';

// Maximum event payload size to prevent DoS (10MB)
const MAX_EVENT_PAYLOAD_SIZE = 10 * 1024 * 1024;

// Maximum channel path length to prevent path traversal
const MAX_CHANNEL_PATH_LENGTH = 256;

const httpEndpoint = process.env.EVENT_HTTP_ENDPOINT!;
const region = process.env.AWS_REGION!;

async function sendEvent(channelPath: string, payload: any) {
  if (!httpEndpoint) {
    // console.log(`event api is not configured!`);
    return;
  }

  // Validate channel path to prevent injection attacks
  if (!channelPath || typeof channelPath !== 'string') {
    console.error('Invalid channel path: must be a non-empty string');
    return;
  }
  if (channelPath.length > MAX_CHANNEL_PATH_LENGTH) {
    console.error(`Channel path too long: ${channelPath.length} > ${MAX_CHANNEL_PATH_LENGTH}`);
    return;
  }
  // Validate channel path characters - only allow safe characters
  if (!/^[a-zA-Z0-9-_/]+$/.test(channelPath)) {
    console.error('Invalid channel path: contains unsafe characters');
    return;
  }

  const endpoint = `${httpEndpoint}/event`;
  const url = new URL(endpoint);

  // Prepare event body
  const eventBody = {
    channel: `event-bus/${channelPath}`,
    events: [JSON.stringify(payload)],
  };

  // Validate serialized payload
  const serializedBody = JSON.stringify(eventBody);
  if (serializedBody.length > MAX_EVENT_PAYLOAD_SIZE) {
    console.error(`Payload exceeds maximum size: ${serializedBody.length} > ${MAX_EVENT_PAYLOAD_SIZE}`);
    return;
  }

  // generate request
  const requestToBeSigned = new HttpRequest({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      host: url.host,
    },
    hostname: url.host,
    body: serializedBody,
    path: url.pathname,
  });

  // initialize signer
  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region,
    service: 'appsync',
    sha256: Sha256,
  });

  // sign request
  const signed = await signer.sign(requestToBeSigned);
  const request = new Request(endpoint, signed);

  // publish event via fetch with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 30000); // 30s timeout

  try {
    const res = await fetch(request, { signal: abortController.signal });
    clearTimeout(timeoutId);

    // Validate response status
    if (!res.ok) {
      console.error(`Event publish failed with status: ${res.status}`);
      return;
    }

    const t = await res.text();
    console.log(t);
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === 'AbortError') {
      console.error('Event publish timed out');
    } else {
      console.error('Event publish failed:', e);
    }
  }
}

export const workerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('onMessageReceived'),
  }),
  z.object({
    type: z.literal('forceStop'),
  }),
  z.object({
    type: z.literal('sessionUpdated'),
  }),
]);

export async function sendWorkerEvent(workerId: string, event: z.infer<typeof workerEventSchema>) {
  return sendEvent(`worker/${workerId}`, event);
}

// Omit does not work below because webappEventSchema is a union type.
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export async function sendWebappEvent(
  workerId: string,
  event: DistributiveOmit<z.infer<typeof webappEventSchema>, 'timestamp' | 'workerId'>
) {
  try {
    await sendEvent(`webapp/worker/${workerId}`, {
      ...event,
      timestamp: Date.now(),
      workerId,
    } satisfies z.infer<typeof webappEventSchema>);
  } catch (e) {
    // webapp event is not critical so we do not throw on error.
    console.log(`failed to send event: ${e}`);
  }
}
