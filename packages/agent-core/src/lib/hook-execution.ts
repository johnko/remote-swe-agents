import { execSync } from 'child_process';
import { listHooksByEvent } from './hooks.js';
import { HookEventType } from '../schema/hook.js';
import { SessionItem } from '../schema/session.js';

/**
 * Extracts user ID from a session's initiator field.
 * If initiator includes '#', takes the part after it (e.g. 'slack#user123' => 'user123')
 * Otherwise returns the initiator as-is (e.g. cognito email).
 */
export const extractUserIdFromSession = (session: SessionItem | undefined): string | undefined => {
  if (!session?.initiator) {
    return undefined;
  }
  return session.initiator.includes('#') ? session.initiator.split('#').pop() : session.initiator;
};

/**
 * Context data available to hooks as environment variables.
 */
export interface HookContextData {
  /** The name of the tool being used (for preToolUse, postToolUse, postToolUseFailure) */
  toolName?: string;
  /** The file path being accessed (for beforeReadFile, afterFileEdit) */
  filePath?: string;
  /** The shell command being executed (for beforeShellExecution, afterShellExecution) */
  command?: string;
  /** The exit code of the shell command (for afterShellExecution) */
  exitCode?: number;
  /** The session ID */
  sessionId?: string;
  /** The subagent session ID (for subagentStart, subagentStop) */
  subagentId?: string;
}

export interface HookExecutionContext {
  sessionId: string;
  event: HookEventType;
  userId: string;
  workingDirectory?: string;
  contextData?: HookContextData;
}

export interface HookExecutionResult {
  hooksExecuted: number;
  hooksSkipped: number;
  errors: Array<{ hookName: string; error: string }>;
  logs: Array<{ hookName: string; output: string }>;
  /** Combined output from all hooks for display to agent */
  combinedOutput?: string;
}

/**
 * Execute all active hooks for a given event and user.
 * Hooks are executed sequentially, and errors in one hook do not prevent others from running.
 * 
 * @param context Hook execution context (sessionId, event, userId, optional workingDirectory)
 * @returns Execution result with counts and any errors/logs
 */
/**
 * Build environment variables for hook execution based on context data.
 */
const buildHookEnv = (contextData?: HookContextData): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  
  if (!contextData) return env;
  
  // Add HOOK_ prefixed environment variables without KIRO_ prefix
  if (contextData.toolName !== undefined) {
    env.HOOK_TOOL_NAME = contextData.toolName;
  }
  if (contextData.filePath !== undefined) {
    env.HOOK_FILE_PATH = contextData.filePath;
  }
  if (contextData.command !== undefined) {
    env.HOOK_COMMAND = contextData.command;
  }
  if (contextData.exitCode !== undefined) {
    env.HOOK_EXIT_CODE = String(contextData.exitCode);
  }
  if (contextData.sessionId !== undefined) {
    env.HOOK_SESSION_ID = contextData.sessionId;
  }
  if (contextData.subagentId !== undefined) {
    env.HOOK_SUBAGENT_ID = contextData.subagentId;
  }

  return env;
};

export const executeHooksForEvent = async (context: HookExecutionContext): Promise<HookExecutionResult> => {
  const result: HookExecutionResult = {
    hooksExecuted: 0,
    hooksSkipped: 0,
    errors: [],
    logs: [],
  };

  try {
    // Get all active hooks for this event and user
    const hooks = await listHooksByEvent(context.userId, context.event);

    if (hooks.length === 0) {
      console.log(`[hook-execution] No hooks found for event: ${context.event}, userId: ${context.userId}`);
      return result;
    }

    console.log(`[hook-execution] Found ${hooks.length} hook(s) for event: ${context.event}`);

    // Build environment with hook context data
    const hookEnv = buildHookEnv(context.contextData);

    // Execute each hook sequentially
    for (const hook of hooks) {
      try {
        const isScript = !!hook.script;
        const content = isScript ? hook.script : hook.command;

        if (!content) {
          result.hooksSkipped++;
          console.warn(`[hook-execution] Hook "${hook.name}" has no command or script content`);
          continue;
        }

        console.log(
          `[hook-execution] Executing hook "${hook.name}" (${isScript ? 'inline script' : 'command'}) for event: ${context.event}`
        );

        let output = '';

        if (isScript) {
          // Execute inline script via node -e
          try {
            output = execSync(`node -e ${JSON.stringify(content)}`, {
              cwd: context.workingDirectory || process.cwd(),
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
              timeout: 30000, // 30 second timeout for hook execution
              env: hookEnv,
            });
          } catch (e: any) {
            // Inline scripts that error should still report the output
            output = e.stdout ? e.stdout.toString('utf-8') : '';
            if (e.stderr) {
              output += '\nSTDERR:\n' + e.stderr.toString('utf-8');
            }
            throw new Error(`Script execution failed: ${e.message}`);
          }
        } else {
          // Execute shell command
          try {
            output = execSync(content, {
              cwd: context.workingDirectory || process.cwd(),
              encoding: 'utf-8',
              stdio: ['pipe', 'pipe', 'pipe'],
              timeout: 30000, // 30 second timeout for hook execution
              env: hookEnv,
            });
          } catch (e: any) {
            output = e.stdout ? e.stdout.toString('utf-8') : '';
            if (e.stderr) {
              output += '\nSTDERR:\n' + e.stderr.toString('utf-8');
            }
            throw new Error(`Command execution failed: ${e.message}`);
          }
        }

        result.hooksExecuted++;
        result.logs.push({
          hookName: hook.name,
          output: output.trim(),
        });

        console.log(`[hook-execution] Hook "${hook.name}" executed successfully`);
      } catch (error: any) {
        result.errors.push({
          hookName: hook.name,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(`[hook-execution] Hook "${hook.name}" failed:`, error);
        // Continue executing other hooks even if one fails
      }
    }
  } catch (error: any) {
    console.error('[hook-execution] Unexpected error during hook execution:', error);
    result.errors.push({
      hookName: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Build combined output from all hook logs
  if (result.logs.length > 0) {
    result.combinedOutput = result.logs
      .filter((l) => l.output.trim())
      .map((l) => `[Hook: ${l.hookName}]\n${l.output}`)
      .join('\n\n');
  }

  return result;
};

/**
 * Convenience function to extract userId from a session and execute hooks.
 * Returns early if userId cannot be determined.
 */
export const executeHooksForEventWithSession = async (
  session: SessionItem | undefined,
  event: HookEventType,
  workingDirectory?: string,
  contextData?: HookContextData
): Promise<HookExecutionResult> => {
  const userId = extractUserIdFromSession(session);
  if (!userId) {
    console.warn('[hook-execution] Could not extract userId from session; skipping hooks');
    return {
      hooksExecuted: 0,
      hooksSkipped: 0,
      errors: [],
      logs: [],
    };
  }

  return executeHooksForEvent({
    sessionId: session?.workerId || 'unknown',
    event,
    userId,
    workingDirectory,
    contextData,
  });
};
