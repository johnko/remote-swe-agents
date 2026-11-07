import { z } from 'zod';
import { ToolDefinition, zodToJsonSchemaBody } from '../../private/common/lib.js';
import { updateSessionTitle, getSession } from '../../lib/sessions.js';
import { sendWebappEvent } from '../../lib/events.js';

// update_session_title tool
const updateInputSchema = z.object({
  title: z
    .string()
    .max(50)
    .describe(
      'A concise title for the current session. Should be descriptive of the conversation topic. Use the same language as the user.'
    ),
});

const updateName = 'update_session_title';

export const updateSessionTitleTool: ToolDefinition<z.infer<typeof updateInputSchema>> = {
  name: updateName,
  handler: async (input: z.infer<typeof updateInputSchema>, context) => {
    const { title } = input;
    await updateSessionTitle(context.workerId, title);
    await sendWebappEvent(context.workerId, { type: 'sessionTitleUpdate', newTitle: title });
    return `Session title updated to: ${title}`;
  },
  schema: updateInputSchema,
  toolSpec: async () => ({
    name: updateName,
    description: `Update the title of the current session. Use this tool to set or change the session title so users can easily identify the conversation topic in the session list.

## When to use:
- At the end of your FIRST turn, after understanding what the user wants
- Proactively whenever the conversation topic evolves or shifts to a different focus. Don't leave a stale title.
- When the user explicitly asks to rename the session

## Guidelines:
- Keep titles concise (under 30 characters preferred)
- Make titles descriptive of the current main topic or task
- Use the same language the user is using`,
    inputSchema: {
      json: zodToJsonSchemaBody(updateInputSchema),
    },
  }),
};

// get_session_title tool
const getInputSchema = z.object({});

const getName = 'get_session_title';

export const getSessionTitleTool: ToolDefinition<z.infer<typeof getInputSchema>> = {
  name: getName,
  handler: async (input: z.infer<typeof getInputSchema>, context) => {
    const session = await getSession(context.workerId);
    if (!session) {
      throw new Error('Session not found');
    }

    const title = session.title ?? '';
    return title;
  },
  schema: getInputSchema,
  toolSpec: async () => ({
    name: getName,
    description: `Get the current session title. Returns the title of the current session, or an empty string if no title has been set.`,
    inputSchema: {
      json: zodToJsonSchemaBody(getInputSchema),
    },
  }),
};
