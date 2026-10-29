import { Tool, ToolResultContentBlock } from '@aws-sdk/client-bedrock-runtime';
import z, { ZodType } from 'zod';
import { GlobalPreferences } from '../../schema/index.js';

export interface CancellationToken {
  readonly isCancelled: boolean;
}

export interface ToolContext {
  readonly workerId: string;
  readonly toolUseId: string;
  readonly globalPreferences: GlobalPreferences;
  readonly cancellationToken?: CancellationToken;
}

export type ToolDefinition<Input> = {
  /**
   * Name of the tool. This is the identifier of the tool for the agent.
   */
  readonly name: string;
  readonly handler: (
    input: Input,
    context: ToolContext
  ) => Promise<string | ToolResultContentBlock[]>;
  readonly schema: ZodType<Input>;
  readonly toolSpec: () => Promise<NonNullable<Tool['toolSpec']>>;
};

export const zodToJsonSchemaBody = (schema: ZodType) => {
  return z.toJSONSchema(schema) as any;
};

export const truncate = (str: string, maxLength: number = 10 * 1e3, headRatio = 0.2) => {
  if (str.length < maxLength) return str;
  if (headRatio < 0 || headRatio > 1) throw new Error('headRatio must be between 0 and 1');

  const first = str.slice(0, maxLength * headRatio);
  const last = str.slice(-maxLength * (1 - headRatio));
  return first + '\n..(truncated)..\n' + last + `\n// Output was truncated. Original length: ${str.length} characters.`;
};
