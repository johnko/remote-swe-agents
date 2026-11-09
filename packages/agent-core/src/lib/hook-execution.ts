import { spawn } from 'child_process';
import { listHooksByEvent } from './hooks.js';
import { HookEventType } from '../schema/hook.js';
import { SessionItem } from '../schema/session.js';
import { resolve, isAbsolute, posix } from 'path';
import { homedir, tmpdir } from 'os';

// Maximum allowed execution time for hooks in milliseconds
const HOOK_EXECUTION_TIMEOUT = 30000;

// Allowed base directories for hook commands
const ALLOWED_CWD_PREFIXES = [
  resolve(homedir()),
  resolve(tmpdir()),
  '/tmp',
  '/var/tmp',
];

// Shell characters and patterns that could enable command injection
const DANGEROUS_SHELL_CHARS = /[;&|`<>=&$\n\r\x00]/;
const DANGEOUS_SHELL_OPERATORS = /(\|\||&&|\|\&|;|`|\$\()/;

/**
 * Validates a command to prevent shell injection attacks.
 * @param command The command string to validate
 * @throws Error if dangerous patterns are detected
 */
const validateHookCommand = (command: string): void => {
  if (!command || typeof command !== 'string') {
    throw new Error('Hook command must be a non-empty string');
  }

  // Check for null bytes
  if (command.includes('\x00')) {
    throw new Error('Hook command contains null bytes');
  }

  // Check for dangerous shell characters/operators
  if (DANGEROUS_SHELL_CHARS.test(command) || DANGEOUS_SHELL_OPERATORS.test(command)) {
    throw new Error('Hook command contains dangerous shell characters or operators');
  }
};

/**
 * Validates inline JavaScript to prevent code injection.
 * @param script The script content to validate
 * @throws Error if dangerous patterns are detected
 */
const validateHookScript = (script: string): void => {
  if (!script || typeof script !== 'string') {
    throw new Error('Hook script must be a non-empty string');
  }

  // Check for null bytes
  if (script.includes('\x00')) {
    throw new Error('Hook script contains null bytes');
  }

  // Check for eval, Function constructor, and other dangerous patterns
  const dangerousPatterns = [
    /eval\s*\(/i,
    /Function\s*\(/,
    /child_process/,
    /require\s*\(\s*['"]`\s*(child_process|fs|path|os|crypto|http|https|net|dgram)/i,
    /process\.exit/,
    /process\.kill/,
    /new\s+Function/,
    /setTimeout\s*\(\s*['"`]/,
    /setInterval\s*\(\s*['"`]/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(script)) {
      throw new Error(`Hook script contains dangerous pattern: ${pattern.source}`);
    }
  }
};

/**
 * Validates working directory to prevent path traversal in hooks.
 * @param cwd The working directory to validate
 * @returns The sanitized absolute path
 * @throws Error if path is outside allowed directories
 */
const validateHookCwd = (cwd?: string): string => {
  if (!cwd) {
    return process.cwd();
  }

  // Must be absolute
  if (!isAbsolute(cwd)) {
    throw new Error('Hook working directory must be an absolute path');
  }

  const resolvedCwd = resolve(cwd);

  // Check against allowed prefixes
  const isAllowed = ALLOWED_CWD_PREFIXES.some((prefix) => {
    const normalizedPrefix = posix.normalize(prefix);
    const normalizedCwd = posix.normalize(resolvedCwd);
    return normalizedCwd === normalizedPrefix || normalizedCwd.startsWith(normalizedPrefix + '/');
  });

  if (!isAllowed) {
    throw new Error(`Hook working directory "${cwd}" is outside allowed directories`);
  }

  return resolvedCwd;
};

/**
 * Executes a hook using spawn (safer than execSync) with security validations.
 * @param command The command to execute
 * @param cwd The working directory
 * @param env Environment variables
 * @param input Optional JSON input to write to stdin
 * @returns The command output
 */
const executeHookCommand = async (
  command: string,
  script: string | undefined,
  cwd: string,
  env: NodeJS.ProcessEnv,
  input?: string
): Promise<string> => {
  const isScript = !!script;
  const content = isScript ? script! : command;

  if (!content) {
    throw new Error('Hook has no command or script content');
  }

  // Validate the command/script before execution
  if (isScript) {
    validateHookScript(content);
  } else {
    validateHookCommand(content);
  }

  return new Promise((resolve, reject) => {
    // Use exec -e to safely execute inline scripts with JSON escaping
    // This prevents shell injection since the script is passed as a string argument
    const args = isScript ? ['-e', content] : [];
    const spawnCommand = isScript ? 'node' : content;

    const childProcess = spawn(spawnCommand, args, {
      cwd,
      env,
      timeout: HOOK_EXECUTION_TIMEOUT,
    });

    let stdout = '';
    let stderr = '';

    if (input && childProcess.stdin && isScript) {
      childProcess.stdin.write(input);
      childProcess.stdin.end();
    }

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    childProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        const errorMessage = stderr ? `\nSTDERR:\n${stderr}` : '';
        reject(new Error(`Hook execution failed with code ${code}${errorMessage}`));
      } else {
        resolve(stdout.trim());
      }
    });

    childProcess.on('error', (error) => {
      reject(new Error(`Hook execution failed: ${error.message}`));
    });
  });
};

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
 * Permission hook result - allows hooks to block or modify actions.
 * Hooks for permission events (beforeShellExecution, preToolUse, etc.) can
 * return JSON output structured as PermissionHookResult.
 */
export interface PermissionHookResult {
  /** Whether execution should proceed */
  continue: boolean;
  /** Permission decision */
  permission: 'allow' | 'deny';
  /** Message shown to user when blocked */
  userMessage?: string;
  /** Message shown to agent when blocked */
  agentMessage?: string;
  /** Modified command for beforeShellExecution hooks */
  updatedCommand?: string;
  /** Modified tool input for preToolUse hooks */
  updatedToolInput?: object;
}

/**
 * Default allow result - returned when no permission hooks deny
 */
export const defaultAllowResult: PermissionHookResult = {
  continue: true,
  permission: 'allow',
};

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

        // SECURITY: Use validated hook execution to prevent command injection
        const validatedCwd = validateHookCwd(context.workingDirectory);
        try {
          output = await executeHookCommand(
            hook.command,
            hook.script,
            validatedCwd,
            hookEnv
          );
        } catch (e: any) {
          // Scripts/commands that error should still report the output
          if (e.message.includes('STDERR:')) {
            const parts = e.message.split('STDERR:');
            output = parts[1]?.trim() || '';
          }
          throw e;
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
 * Build hook input JSON for permission hooks.
 * This provides hooks with structured context data.
 */
export const buildHookInput = (context: HookExecutionContext): object => {
  return {
    event: context.event,
    sessionId: context.sessionId,
    userId: context.userId,
    workingDirectory: context.workingDirectory,
    context: context.contextData,
  };
};

/**
 * Parse hook output as PermissionHookResult.
 * Falls back to 'allow' if JSON parsing fails (backward compatibility).
 */
export const parsePermissionResult = (output: string): PermissionHookResult => {
  try {
    const parsed = JSON.parse(output);
    // Validate required fields
    if (typeof parsed.permission === 'string' && ['allow', 'deny'].includes(parsed.permission)) {
      return {
        continue: parsed.continue ?? true,
        permission: parsed.permission as 'allow' | 'deny',
        userMessage: parsed.user_message || parsed.userMessage,
        agentMessage: parsed.agent_message || parsed.agentMessage,
        updatedCommand: parsed.updated_command || parsed.updatedCommand,
        updatedToolInput: parsed.updated_tool_input || parsed.updatedToolInput,
      };
    }
  } catch {
    // Legacy hooks return exit code 0 = allow
    console.log('[hook-execution] Hook returned non-JSON output, treating as allow');
  }
  return defaultAllowResult;
};

/**
 * Execute permission hooks for blocking/modifying actions.
 * Hooks are expected to return JSON output with a PermissionHookResult structure.
 *
 * @param context Hook execution context
 * @returns PermissionHookResult with decision and optional modifications
 */
export const executePermissionHooks = async (
  context: HookExecutionContext
): Promise<PermissionHookResult> => {
  try {
    // Get all active hooks for this event and user
    const hooks = await listHooksByEvent(context.userId, context.event);

    if (hooks.length === 0) {
      return defaultAllowResult;
    }

    console.log(`[hook-execution] Found ${hooks.length} permission hook(s) for event: ${context.event}`);

    // Build environment with hook context data
    const hookEnv = buildHookEnv(context.contextData);
    const hookInput = buildHookInput(context);

    // Execute each hook sequentially
    for (const hook of hooks) {
      try {
        const isScript = !!hook.script;
        const content = isScript ? hook.script : hook.command;

        if (!content) {
          console.warn(`[hook-execution] Permission hook "${hook.name}" has no command or script`);
          continue;
        }

        console.log(
          `[hook-execution] Executing permission hook "${hook.name}" for event: ${context.event}`
        );

        let output = '';

        // SECURITY: Use validated hook execution to prevent command injection
        const validatedCwd = validateHookCwd(context.workingDirectory);
        try {
          output = await executeHookCommand(
            hook.command,
            hook.script,
            validatedCwd,
            hookEnv,
            JSON.stringify(hookInput)
          );
        } catch (e: any) {
          // Permission hooks that error are treated as allowing (fail-open)
          console.error(`[hook-execution] Permission hook "${hook.name}" failed:`, e);
          continue;
        }

        const permissionResult = parsePermissionResult(output);
        console.log(
          `[hook-execution] Permission hook "${hook.name}" returned: ${permissionResult.permission}`
        );

        // If any hook denies, return immediately
        if (permissionResult.permission === 'deny') {
          return permissionResult;
        }

        // Apply modifications to context
        if (permissionResult.updatedCommand && context.contextData) {
          context.contextData.command = permissionResult.updatedCommand;
        }
        if (permissionResult.updatedToolInput && context.contextData) {
          // Tool input modification handled by caller
        }
      } catch (error: any) {
        console.error(`[hook-execution] Permission hook "${hook.name}" failed:`, error);
        // Fail-open: continue execution even if a hook errors
      }
    }
  } catch (error: any) {
    console.error('[hook-execution] Unexpected error during permission hook execution:', error);
  }

  // Default: allow
  return defaultAllowResult;
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
