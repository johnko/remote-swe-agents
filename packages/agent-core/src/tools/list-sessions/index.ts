import { z } from 'zod';
import { ToolDefinition, zodToJsonSchemaBody } from '../../private/common/lib.js';
import { getSession, getChildSessions, getDescendantSessions, getSessions } from '../../lib/sessions.js';
import { resolveAgentDisplayName } from '../../lib/agent-messaging.js';
import { SessionItem } from '../../schema/index.js';

const inputSchema = z.object({
  scope: z
    .enum(['children', 'descendants', 'all'])
    .default('children')
    .describe(
      'Scope of sessions to list: "children" (direct children, default), "descendants" (full subtree), "all" (every session).'
    ),
  sessionId: z
    .string()
    .optional()
    .describe(
      'The session ID to list children/descendants of. Defaults to the current session. Ignored when scope is "all".'
    ),
  statusFilter: z
    .enum(['all', 'active', 'completed'])
    .default('all')
    .describe(
      'Filter by status: "all" (default), "active" (agentStatus != completed), "completed" (agentStatus == completed).'
    ),
});

const name = 'list_sessions';

export const listSessionsTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name,
  handler: async (input: z.infer<typeof inputSchema>, context) => {
    const scope = input.scope ?? 'children';
    const statusFilter = input.statusFilter ?? 'all';
    const targetSessionId = input.sessionId ?? context.workerId;

    // Check permissions for non-trivial access
    if (scope === 'all' || targetSessionId !== context.workerId) {
      const callerSession = await getSession(context.workerId);
      if (!callerSession) {
        return 'Error: Could not retrieve current session information.';
      }

      const callerIsTopLevel = !callerSession.parentSessionId;

      // scope="all" requires top-level session status
      if (scope === 'all' && !callerIsTopLevel) {
        return "Permission denied: scope='all' can only be used by top-level sessions (no parent). Use 'children' or 'descendants' to query your own session tree.";
      }

      // For non-self targets, verify caller is parent, target, or top-level
      if (targetSessionId !== context.workerId) {
        const targetSession = await getSession(targetSessionId);
        if (!targetSession) {
          return `Error: Session ${targetSessionId} not found.`;
        }

        const callerIsTargetParent = targetSession.parentSessionId === context.workerId;

        if (!callerIsTopLevel && !callerIsTargetParent) {
          return "Permission denied: only the target's current parent, the target itself, or a top-level session can list another session's children/descendants.";
        }
      }
    }

    let sessions: SessionItem[];

    switch (scope) {
      case 'children':
        sessions = await getChildSessions(targetSessionId);
        break;
      case 'descendants':
        sessions = await getDescendantSessions(targetSessionId);
        break;
      case 'all':
        sessions = await getSessions(0);
        break;
    }

    if (statusFilter === 'active') {
      sessions = sessions.filter((s) => s.agentStatus !== 'completed');
    } else if (statusFilter === 'completed') {
      sessions = sessions.filter((s) => s.agentStatus === 'completed');
    }

    if (sessions.length === 0) {
      return 'No sessions found.';
    }

    const scopeLabel =
      scope === 'children'
        ? `Child sessions of ${targetSessionId}`
        : scope === 'descendants'
          ? `Descendant sessions of ${targetSessionId}`
          : 'All sessions';
    const filterLabel = statusFilter !== 'all' ? ` (filter: ${statusFilter})` : '';

    const lines: string[] = [`${scopeLabel}${filterLabel} (${sessions.length} total):\n`];
    for (const session of sessions) {
      const displayName = await resolveAgentDisplayName(session);
      lines.push(
        `- ${displayName} (ID: ${session.workerId}) [${session.agentStatus ?? 'unknown'}]` +
          (session.title ? ` — ${session.title}` : '')
      );
    }
    return lines.join('\n');
  },
  schema: inputSchema,
  toolSpec: async () => ({
    name,
    description: `List sessions by scope: direct children, full descendant tree, or all sessions.

Scopes:
- "children" (default): Direct child sessions of the target.
- "descendants": Full recursive subtree (children, grandchildren, etc.).
- "all": Every session in the system. This is a broad query — use only from top-level or authorized sessions.

Permission: When listing another session's children/descendants (sessionId != self), the caller must be one of:
- The target session's current parent
- The target session itself
- A top-level (no parent) session
No permission check is needed for scope="all" or when listing your own children.

Parameters:
- scope: "children" | "descendants" | "all" (default: "children")
- sessionId (optional): Target session. Defaults to current session. Ignored for scope="all".
- statusFilter: "all" | "active" | "completed" (default: "all")`,
    inputSchema: {
      json: zodToJsonSchemaBody(inputSchema),
    },
  }),
};
