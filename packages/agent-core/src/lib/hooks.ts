import { QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableName } from './aws/index.js';
import {
  Hook,
  HookCreatedBy,
  HookStatus,
  MAX_HOOKS_PER_USER,
} from '../schema/hook.js';

/**
 * Hook (memory) store. Hooks are durable, user-scoped notes that capture
 * reusable logic or behavior patterns for customizing agent functionality.
 * Scoping mirrors lessons and user-preferences (PK = `hook-<userId>`).
 */
const hookPK = (userId: string) => `hook-${userId}`;

export const getHook = async (userId: string, hookId: string): Promise<Hook | undefined> => {
  const res = await ddb.send(
    new GetCommand({
      TableName,
      Key: { PK: hookPK(userId), SK: hookId },
    })
  );
  return res.Item as Hook | undefined;
};

export const listHooks = async (userId: string): Promise<Hook[]> => {
  // A hook item can be large (body up to ~2KB), so a single DDB Query page
  // (max 1MB) holds many items, but we still need to page through LastEvaluatedKey
  // to handle users with many hooks.
  const items: Hook[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': hookPK(userId),
        },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    items.push(...(res.Items as Hook[]));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
};

export const createHook = async (
  userId: string,
  input: Omit<Hook, 'PK' | 'SK' | 'createdAt' | 'updatedAt'>
): Promise<Hook> => {
  // Enforce the per-user cap before creating a new hook.
  const currentHooks = await listHooks(userId);
  if (currentHooks.length >= MAX_HOOKS_PER_USER) {
    throw new Error(
      `Cannot create more than ${MAX_HOOKS_PER_USER} hooks. ` +
        `Delete some existing hooks first.`
    );
  }

  const now = Date.now();
  const hookId = `hook-${Math.random().toString(36).substring(2, 10)}-${now}`;

  const hook: Hook = {
    PK: hookPK(userId),
    SK: hookId,
    content: input.content,
    category: input.category,
    status: "active",
    createdBy: input.createdBy ?? "agent",
    sourceSessionId: input.sourceSessionId,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(
    new PutCommand({
      TableName,
      Item: hook,
    })
  );

  return hook;
};

export const updateHook = async (
  userId: string,
  hookId: string,
  input: Partial<Omit<Hook, 'PK' | 'SK' | 'createdAt' | 'updatedAt'>>
): Promise<Hook> => {
  const existing = await getHook(userId, hookId);
  if (!existing) {
    throw new Error(`Hook not found: ${hookId}`);
  }

  const now = Date.now();
  const updated: Hook = {
    ...existing,
    ...input,
    updatedAt: now,
  };

  await ddb.send(
    new PutCommand({
      TableName,
      Item: updated,
    })
  );

  return updated;
};

export const deleteHook = async (userId: string, hookId: string): Promise<void> => {
  await ddb.send(
    new DeleteCommand({
      TableName,
      Key: { PK: hookPK(userId), SK: hookId },
    })
  );
};
