import { z } from 'zod';
import { ToolDefinition, zodToJsonSchemaBody } from '../../private/common/lib.js';
import { listHooks, getHook, createHook, updateHook, deleteHook } from '../../lib/hooks.js';
import { getSession } from '../../lib/sessions.js';
import {
  MAX_HOOK_NAME_LENGTH,
  MAX_HOOK_DESCRIPTION_LENGTH,
  MAX_HOOK_COMMAND_LENGTH,
  MAX_HOOK_SCRIPT_LENGTH,
  MAX_HOOKS_PER_USER,
  hookEventTypeSchema,
} from '../../schema/hook.js';

const resolveUserId = async (workerId: string): Promise<string> => {
  const session = await getSession(workerId);
  if (!session?.initiator) {
    throw new Error('Could not determine user identity from session.');
  }
  return session.initiator.includes('#') ? session.initiator.split('#').pop()! : session.initiator;
};

const hooksManagementDescription = `Manage user hooks: list, get, create, update, or delete hooks.

Hooks are user-scoped custom scripts that can observe, control, and extend the agent loop by running at specific lifecycle events (like sessionStart, preToolUse, afterFileEdit, etc.). They are per-user like lessons, NOT per-repo.`;

const listHooksSchema = z.object({});
const getHookSchema = z.object({
  hookId: z.string().describe('The ID of the hook to retrieve.'),
});
const createHookSchema = z.object({
  name: z.string().min(1).max(MAX_HOOK_NAME_LENGTH).describe('The hook name (identifier).'),
  description: z.string().max(MAX_HOOK_DESCRIPTION_LENGTH).optional().describe('Optional description of what the hook does.'),
  event: hookEventTypeSchema.describe('The event type that triggers this hook.'),
  command: z.string().min(1).max(MAX_HOOK_COMMAND_LENGTH).describe('The command to execute when the hook fires.'),
  script: z.string().max(MAX_HOOK_SCRIPT_LENGTH).optional().describe('Optional inline script content.'),
});
const updateHookSchema = z.object({
  hookId: z.string().describe('The ID of the hook to update.'),
  name: z.string().min(1).max(MAX_HOOK_NAME_LENGTH).optional().describe('New hook name.'),
  description: z.string().max(MAX_HOOK_DESCRIPTION_LENGTH).optional().describe('New description.'),
  event: hookEventTypeSchema.optional().describe('New event type.'),
  command: z.string().min(1).max(MAX_HOOK_COMMAND_LENGTH).optional().describe('New command.'),
  script: z.string().max(MAX_HOOK_SCRIPT_LENGTH).optional().describe('New script content.'),
});
const deleteHookSchema = z.object({
  hookId: z.string().describe('The ID of the hook to delete.'),
});

export const listHooksTool: ToolDefinition<z.infer<typeof listHooksSchema>> = {
  name: 'list_hooks',
  handler: async (_input, context) => {
    const userId = await resolveUserId(context.workerId);
    const hooks = await listHooks(userId);
    if (hooks.length === 0) return 'No hooks found.';
    const summary = hooks.map((h) => ({
      id: h.SK,
      name: h.name,
      description: h.description,
      event: h.event,
      command: h.command,
      isActive: h.isActive,
      createdBy: h.createdBy,
      createdAt: new Date(h.createdAt).toISOString(),
      updatedAt: new Date(h.updatedAt).toISOString(),
    }));
    return JSON.stringify(summary, null, 2);
  },
  schema: listHooksSchema,
  toolSpec: async () => ({
    name: 'list_hooks',
    description: `List all hooks for the current user.\n\n${hooksManagementDescription}`,
    inputSchema: { json: zodToJsonSchemaBody(listHooksSchema) },
  }),
};

export const getHookTool: ToolDefinition<z.infer<typeof getHookSchema>> = {
  name: 'get_hook',
  handler: async (input, context) => {
    const userId = await resolveUserId(context.workerId);
    const hook = await getHook(userId, input.hookId);
    if (!hook) return `Hook with ID "${input.hookId}" not found.`;
    return JSON.stringify(
      {
        id: hook.SK,
        name: hook.name,
        description: hook.description,
        event: hook.event,
        command: hook.command,
        script: hook.script,
        isActive: hook.isActive,
        createdBy: hook.createdBy,
        sourceSessionId: hook.sourceSessionId,
        createdAt: new Date(hook.createdAt).toISOString(),
        updatedAt: new Date(hook.updatedAt).toISOString(),
      },
      null,
      2
    );
  },
  schema: getHookSchema,
  toolSpec: async () => ({
    name: 'get_hook',
    description: `Get details of a specific hook by ID.\n\n${hooksManagementDescription}`,
    inputSchema: { json: zodToJsonSchemaBody(getHookSchema) },
  }),
};

export const createHookTool: ToolDefinition<z.infer<typeof createHookSchema>> = {
  name: 'create_hook',
  handler: async (input, context) => {
    const userId = await resolveUserId(context.workerId);
    try {
      const hook = await createHook(userId, {
        name: input.name,
        description: input.description,
        event: input.event,
        command: input.command,
        script: input.script,
        isActive: false, // Intentional: hooks are created inactive; humans must activate them
        createdBy: 'agent',
        sourceSessionId: context.workerId,
      });
      return `Hook created successfully.\n- ID: ${hook.SK}\n- Name: ${hook.name}\n- Event: ${hook.event}`;
    } catch (e) {
      return `Error: ${(e as Error).message}`;
    }
  },
  schema: createHookSchema,
  toolSpec: async () => ({
    name: 'create_hook',
    description: `Create a new hook. Hooks let you run custom scripts at specific agent lifecycle events. Max ${MAX_HOOKS_PER_USER} hooks per user.\n\n${hooksManagementDescription}`,
    inputSchema: { json: zodToJsonSchemaBody(createHookSchema) },
  }),
};

export const updateHookTool: ToolDefinition<z.infer<typeof updateHookSchema>> = {
  name: 'update_hook',
  handler: async (input, context) => {
    const userId = await resolveUserId(context.workerId);
    if (
      input.name === undefined &&
      input.description === undefined &&
      input.event === undefined &&
      input.command === undefined &&
      input.script === undefined
    ) {
      return 'Error: Provide at least one field to update.';
    }
    try {
      const hook = await updateHook(userId, input.hookId, {
        name: input.name,
        description: input.description,
        event: input.event,
        command: input.command,
        script: input.script,
      });
      return `Hook updated successfully.\n- ID: ${hook.SK}\n- Name: ${hook.name}\n- isActive: ${hook.isActive}`;
    } catch (e) {
      const err = e as Error;
      if (err.name === 'ConditionalCheckFailedException') {
        return `Error: Hook with ID "${input.hookId}" not found.`;
      }
      return `Error: ${err.message}`;
    }
  },
  schema: updateHookSchema,
  toolSpec: async () => ({
    name: 'update_hook',
    description: `Update a hook's fields (name, description, event, command, script, or isActive).\n\n${hooksManagementDescription}`,
    inputSchema: { json: zodToJsonSchemaBody(updateHookSchema) },
  }),
};

export const deleteHookTool: ToolDefinition<z.infer<typeof deleteHookSchema>> = {
  name: 'delete_hook',
  handler: async (input, context) => {
    const userId = await resolveUserId(context.workerId);
    const hook = await getHook(userId, input.hookId);
    if (!hook) return `Hook with ID "${input.hookId}" not found.`;
    if (hook.isActive === true) {
      return `Error: Cannot delete an active hook. Set isActive to false before deleting.`;
    }
    await deleteHook(userId, input.hookId);
    return `Hook (ID: ${input.hookId}) deleted successfully.`;
  },
  schema: deleteHookSchema,
  toolSpec: async () => ({
    name: 'delete_hook',
    description: `Delete a hook by ID. To keep it but disable it, use update_hook with isActive=false instead.\n\n${hooksManagementDescription}`,
    inputSchema: { json: zodToJsonSchemaBody(deleteHookSchema) },
  }),
};
