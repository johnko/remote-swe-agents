import { QueryCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableName } from './aws/index.js';
import {
  Hook,
  HookCreatedBy,
  MAX_HOOKS_PER_USER,
} from '../schema/hook.js';
import { randomBytes } from 'crypto';

/**
 * Hook store. Hooks are user-scoped custom scripts that can observe,
 * control, and extend the agent loop by running at specific lifecycle events.
 * Scoping mirrors skills and lessons (PK = `hook-<userId>`).
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
  const items: Hook[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': hookPK(userId) },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    if (res.Items) items.push(...(res.Items as Hook[]));
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
};

export const listActiveHooks = async (userId: string): Promise<Hook[]> => {
  const all = await listHooks(userId);
  return all.filter((h) => h.isActive !== false);
};

export const listHooksByEvent = async (userId: string, event: string): Promise<Hook[]> => {
  const active = await listActiveHooks(userId);
  return active.filter((h) => h.event === event);
};

export interface CreateHookInput {
  name: string;
  description?: string;
  event: string;
  command: string;
  script?: string;
  isActive?: boolean;
  createdBy?: HookCreatedBy;
  sourceSessionId?: string;
}

export const createHook = async (userId: string, input: CreateHookInput): Promise<Hook> => {
  const existing = await listHooks(userId);
  if (existing.length >= MAX_HOOKS_PER_USER) {
    throw new Error(`MAX_HOOKS_EXCEEDED: Cannot create more than ${MAX_HOOKS_PER_USER} hooks`);
  }

  const now = Date.now();
  const id = randomBytes(6).toString('base64url');

  const hook: Hook = {
    PK: hookPK(userId),
    SK: id,
    name: input.name,
    description: input.description,
    event: input.event as Hook['event'],
    command: input.command,
    script: input.script,
    isActive: input.isActive ?? false,
    createdBy: input.createdBy ?? 'user',
    sourceSessionId: input.sourceSessionId,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName, Item: hook }));
  return hook;
};

export interface UpdateHookInput {
  name?: string;
  description?: string;
  event?: string;
  command?: string;
  script?: string;
  isActive?: boolean;
}

export const updateHook = async (userId: string, hookId: string, input: UpdateHookInput): Promise<Hook> => {
  const existing = await getHook(userId, hookId);
  if (!existing) {
    throw new Error('HOOK_NOT_FOUND: Hook does not exist.');
  }

  const now = Date.now();
  const setExpr: string[] = ['#updatedAt = :updatedAt'];
  const removeExpr: string[] = [];
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const values: Record<string, unknown> = { ':updatedAt': now };

  if (input.name !== undefined) {
    setExpr.push('#name = :name');
    names['#name'] = 'name';
    values[':name'] = input.name;
  }
  if (input.description !== undefined) {
    setExpr.push('#description = :description');
    names['#description'] = 'description';
    values[':description'] = input.description;
  }
  if (input.event !== undefined) {
    setExpr.push('#event = :event');
    names['#event'] = 'event';
    values[':event'] = input.event;
  }
  if (input.command !== undefined) {
    setExpr.push('#command = :command');
    names['#command'] = 'command';
    values[':command'] = input.command;
  }
  if (input.script !== undefined) {
    if (input.script === '') {
      removeExpr.push('#script');
      names['#script'] = 'script';
    } else {
      setExpr.push('#script = :script');
      names['#script'] = 'script';
      values[':script'] = input.script;
    }
  }
  if (input.isActive !== undefined) {
    setExpr.push('#isActive = :isActive');
    names['#isActive'] = 'isActive';
    values[':isActive'] = input.isActive;
  }

  const updateExpression = [`SET ${setExpr.join(', ')}`, removeExpr.length ? `REMOVE ${removeExpr.join(', ')}` : '']
    .filter(Boolean)
    .join(' ');

  const res = await ddb.send(
    new UpdateCommand({
      TableName,
      Key: { PK: hookPK(userId), SK: hookId },
      ConditionExpression: 'attribute_exists(PK)',
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    })
  );
  return res.Attributes as Hook;
};

export const deleteHook = async (userId: string, hookId: string): Promise<void> => {
  await ddb.send(
    new DeleteCommand({
      TableName,
      Key: { PK: hookPK(userId), SK: hookId },
    })
  );
};
