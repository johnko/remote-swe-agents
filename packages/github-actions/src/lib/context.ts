export interface ActionContext {
  triggerPhrase: string;
  assigneeTrigger?: string;
  apiBaseUrl: string;
  apiKey: string;
}

// Type definition for GitHub webhook payload
// Equivalent to @actions/github's WebhookPayload type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WebhookPayload = Record<string, any>;
