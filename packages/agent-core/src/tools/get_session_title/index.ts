import { z } from 'zod';
import { ToolDefinition, zodToJsonSchemaBody } from '../../private/common/lib.js';
import { getSession } from '../../lib/sessions.js';

const inputSchema = z.object({});

const name = 'get_session_title';

export const getSessionTitleTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name,
  handler: async (input: z.infer<typeof inputSchema>, context) => {
    const session = await getSession(context.workerId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    const title = session.title ?? '';
    return title;
  },
  schema: inputSchema,
  toolSpec: async () => ({
    name,
    description: `Get the current session title. Returns the title of the current session, or an empty string if no title has been set.`,
    inputSchema: {
      json: zodToJsonSchemaBody(inputSchema),
    },
  }),
};
