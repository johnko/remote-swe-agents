import { spawn } from 'child_process';
import { authorizeGitHubCli } from './github.js';
export { isGitHubConfigured, authorizeGitHubCli } from './github.js';
import { homedir, tmpdir } from 'os';
import { join, isAbsolute, resolve } from 'path';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { z } from 'zod';
import { CancellationToken, ToolDefinition, truncate, zodToJsonSchemaBody } from '../../private/common/lib.js';
import { generateSuggestion } from './suggestion.js';
import { getSession, executeHooksForEventWithSession, executePermissionHooks } from '../../lib/index.js';
import {
  logToolExecution,
  logPermissionDenied,
  logPermissionModified,
  logSecurityError,
} from '../../lib/security-logger.js';

// Shell characters that could enable command injection - these are blocked in the command
const DANGEROUS_SHELL_CHARS = /[;&|`<>=&$\n\r\x00]/;
// Shell operators that could chain commands
const DANGEROUS_SHELL_OPERATORS = /(\|\||&&|\|\&|;|`|\$\(|\$\{)/;
// Blocked command prefixes (subshell execution)
const BLOCKED_COMMAND_PATTERNS = [
  /^\s*\(/,         // Parenthesis subshell: (command)
  /^\s*\{/,          // Brace group: { command; }
  /^\s*source\s/,    // Source command
  /^\s*\.\s/,        // Dot command (source)
  /^\s*exec\s/,      // Exec command (replaces shell)
  /^\s*eval\s/,      // Eval command
];

/**
 * Validates that a command doesn't contain dangerous characters or patterns
 * that could enable command injection.
 * @param command The command string to validate
 * @throws Error if dangerous patterns are detected
 */
const sanitizeCommand = (command: string): void => {
  if (!command || typeof command !== 'string') {
    throw new Error('Command must be a non-empty string');
  }

  // Check for null bytes (could confuse shell)
  if (command.includes('\x00')) {
    throw new Error('Command contains null byte characters');
  }

  // Check for dangerous shell characters
  if (DANGEROUS_SHELL_CHARS.test(command)) {
    throw new Error(
      `Command contains dangerous shell characters that could enable command injection. ` +
      `Use the file_editor tool or other specific tools for file operations, pipes, or redirections.`
    );
  }

  // Check for dangerous operators
  if (DANGEROUS_SHELL_OPERATORS.test(command)) {
    throw new Error(
      `Command contains shell operators that could chain multiple commands. ` +
      `Execute multiple commands separately using the execute_command tool multiple times.`
    );
  }

  // Check for blocked command patterns
  for (const pattern of BLOCKED_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(
        `Command contains blocked pattern matching ${pattern.source}. ` +
        `This pattern could enable shell injection or subshell execution.`
      );
    }
  }
};

/**
 * Validates and sanitizes the working directory path
 * @param cwd The working directory to validate
 * @param command The command being executed (for error messages)
 * @returns The sanitized absolute path
 * @throws Error if the path is outside allowed directories
 */
const sanitizeWorkingDirectory = (cwd?: string, command?: string): string => {
  if (!cwd) {
    return DefaultWorkingDirectory;
  }

  // Resolve to absolute path
  const resolvedCwd = resolve(cwd);

  // Validate the path is absolute and within allowed directories
  const allowedPrefixes = [
    DefaultWorkingDirectory,
    tmpdir(),
    homedir(),
    '/tmp',
    '/var/tmp',
  ];

  const isAllowed = allowedPrefixes.some(prefix => {
    const resolvedPrefix = resolve(prefix);
    return resolvedCwd === resolvedPrefix || resolvedCwd.startsWith(resolvedPrefix + '/');
  });

  if (!isAllowed) {
    throw new Error(
      `Working directory "${cwd}" is outside allowed directories. ` +
      `Allowed directories include: ${DefaultWorkingDirectory}, /tmp, and user home directory.`
    );
  }

  return resolvedCwd;
};

const inputSchema = z.object({
  command: z.string().describe('The command to execute.'),
  cwd: z.string().optional().describe('The current working directory to execute the command in.'),
  longRunningProcess: z
    .boolean()
    .optional()
    .describe(
      'If true, do not wait for the process to exit; leave the process running and return control after 10 seconds.'
    ),
  timeoutMs: z
    .number()
    .optional()
    .describe('Custom timeout in milliseconds for command execution. Default is 60000ms (60 seconds).'),
});

export const DefaultWorkingDirectory = join(homedir(), `.remote-swe-workspace`);
spawn('mkdir', ['-p', DefaultWorkingDirectory]);

/**
 * Stable marker embedded in the error returned when a command is cancelled
 * mid-flight and left running in the background. Exported so other tools
 * (e.g. waitForCondition) can detect this state without depending on the
 * surrounding wording, which would otherwise drift silently.
 */
export const BACKGROUND_CANCELLATION_MARKER = 'is still running in background';

export const PID_DIR = join(tmpdir(), '.remote-swe-pids');
mkdirSync(PID_DIR, { recursive: true });

/**
 * Maximum number of bytes allowed in the stdout/stderr accumulation buffer
 * before we truncate and kill the child process. This prevents unbounded
 * string growth that crashes the worker with `RangeError: Invalid string length`.
 * 10 MB is generous for legitimate output while preventing OOM on infinite streams.
 */
export const MAX_OUTPUT_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

const savePidFile = (toolUseId: string, pid: number, command: string) => {
  try {
    writeFileSync(join(PID_DIR, toolUseId), JSON.stringify({ pid, command }));
  } catch (e) {
    console.log(`Failed to write PID file for ${toolUseId}: ${e}`);
  }
};

const removePidFile = (toolUseId: string) => {
  try {
    unlinkSync(join(PID_DIR, toolUseId));
  } catch {
    // file may already be deleted
  }
};

export const executeCommand = async (
  command: string,
  cwd?: string,
  timeoutMs = 60000,
  longRunningProcess = false,
  toolUseId?: string,
  cancellationToken?: CancellationToken
) => {
  // CRITICAL SECURITY: Sanitize command to prevent injection attacks
  sanitizeCommand(command);

  // Validate working directory to prevent path traversal
  cwd = sanitizeWorkingDirectory(cwd, command);

  // Ignore error when github token is not available
  const token = await authorizeGitHubCli().catch((e) => console.log(e));

  return new Promise<{
    stdout: string;
    stderr: string;
    error?: string;
    exitCode?: number;
    suggestion?: string;
    isLongRunning?: boolean;
  }>((resolve) => {
    console.log(`Executing command: ${command} in ${cwd}`);
    const childProcess = spawn(command, [], {
      cwd,
      shell: true,
      env: {
        ...process.env,
        GITHUB_TOKEN: token ?? '',
      },
    });

    if (toolUseId && childProcess.pid) {
      savePidFile(toolUseId, childProcess.pid, command);
    }

    let stdout = '';
    let stderr = '';
    let timer: NodeJS.Timeout;
    let longRunningTimer: NodeJS.Timeout | undefined;
    let cancellationInterval: NodeJS.Timeout | undefined;
    let hasExited = false;
    let resolved = false;

    const safeResolve = (result: {
      stdout: string;
      stderr: string;
      error?: string;
      exitCode?: number;
      suggestion?: string;
      isLongRunning?: boolean;
    }) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const resetTimer = () => {
      if (resolved) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Only kill the process if it's not a long-running one and not already resolved
        if (!longRunningProcess && !resolved) {
          clearTimeout(timer);
          if (longRunningTimer) clearTimeout(longRunningTimer);
          if (cancellationInterval) clearInterval(cancellationInterval);
          hasExited = true;
          if (toolUseId) removePidFile(toolUseId);
          childProcess.kill();
          safeResolve({
            error: `Command execution timed out after ${Math.round(timeoutMs / 1000)} seconds of inactivity`,
            stdout: truncate(stdout, 40e3),
            stderr: truncate(stderr),
            suggestion: generateSuggestion(command, false),
          });
        }
      }, timeoutMs);
    };

    resetTimer();

    // For long-running processes, we wait for 10 seconds and then return control to the agent
    if (longRunningProcess) {
      longRunningTimer = setTimeout(() => {
        if (!hasExited) {
          console.log(`Returning control to agent after 10 seconds for long-running process: ${command}`);
          safeResolve({
            stdout: truncate(stdout, 40e3),
            stderr: truncate(stderr),
            isLongRunning: true,
            suggestion: generateSuggestion(command, true),
          });
        }
      }, 10000); // 10 seconds
    }

    if (cancellationToken) {
      cancellationInterval = setInterval(() => {
        if (cancellationToken.isCancelled && !hasExited) {
          console.log(
            `Cancellation requested, leaving process running in background for command: ${command} (PID: ${childProcess.pid})`
          );
          clearTimeout(timer);
          if (longRunningTimer) clearTimeout(longRunningTimer);
          clearInterval(cancellationInterval!);
          // Do NOT kill the process — let it continue in background
          // Do NOT remove PID file — process is still running
          safeResolve({
            stdout: truncate(stdout, 40e3),
            stderr: truncate(stderr),
            error: `Command ${BACKGROUND_CANCELLATION_MARKER} (PID: ${childProcess.pid}). The agent session was interrupted by a new incoming message.`,
          });
        }
      }, 100);
    }

    childProcess.on('error', (error) => {
      clearTimeout(timer);
      if (longRunningTimer) clearTimeout(longRunningTimer);
      if (cancellationInterval) clearInterval(cancellationInterval);
      hasExited = true;
      if (toolUseId) removePidFile(toolUseId);
      safeResolve({
        error: `Failed to interact with the process: ${error.message}`,
        stdout: truncate(stdout, 40e3),
        stderr: truncate(stderr),
        suggestion: generateSuggestion(command, false),
      });
    });

    let outputTruncated = false;

    const handleBufferOverflow = () => {
      if (outputTruncated) return;
      outputTruncated = true;
      clearTimeout(timer);
      if (longRunningTimer) clearTimeout(longRunningTimer);
      if (cancellationInterval) clearInterval(cancellationInterval);
      hasExited = true;
      if (toolUseId) removePidFile(toolUseId);
      childProcess.kill();
      childProcess.stdout.destroy();
      childProcess.stderr.destroy();
      const marker = `\n[output truncated: exceeded ${MAX_OUTPUT_BUFFER_BYTES} bytes, process killed]`;
      const appendToStdout = stdout.length >= stderr.length;
      safeResolve({
        error: `Command output exceeded maximum buffer size (${MAX_OUTPUT_BUFFER_BYTES} bytes) and was killed`,
        stdout: truncate(stdout, 40e3) + (appendToStdout ? marker : ''),
        stderr: truncate(stderr) + (appendToStdout ? '' : marker),
        suggestion: generateSuggestion(command, false),
      });
    };

    childProcess.stdout.on('data', (data) => {
      if (resolved) return;
      stdout += data.toString();
      if (stdout.length + stderr.length >= MAX_OUTPUT_BUFFER_BYTES) {
        handleBufferOverflow();
        return;
      }
      resetTimer();
    });

    childProcess.stderr.on('data', (data) => {
      if (resolved) return;
      stderr += data.toString();
      if (stdout.length + stderr.length >= MAX_OUTPUT_BUFFER_BYTES) {
        handleBufferOverflow();
        return;
      }
      resetTimer();
    });

    childProcess.on('close', (code) => {
      clearTimeout(timer);
      if (longRunningTimer) clearTimeout(longRunningTimer);
      if (cancellationInterval) clearInterval(cancellationInterval);
      hasExited = true;
      if (toolUseId) removePidFile(toolUseId);

      // If the process exits within the 10 seconds window for long-running processes,
      // we should report that instead of leaving it running
      if (code === 0) {
        safeResolve({
          stdout: truncate(stdout, 40e3),
          stderr: truncate(stderr),
          suggestion: generateSuggestion(command, true),
        });
      } else {
        safeResolve({
          error: `Command failed with exit code ${code}`,
          exitCode: code!,
          stdout: truncate(stdout, 40e3),
          stderr: truncate(stderr),
          suggestion: generateSuggestion(command, false),
        });
      }
    });
  });
};

const handler = async (
  input: { command: string; cwd?: string; longRunningProcess?: boolean; timeoutMs?: number },
  context: { toolUseId: string; cancellationToken?: CancellationToken; workerId?: string }
) => {
  // Validate that timeoutMs and longRunningProcess are not used together
  if (input.timeoutMs !== undefined && input.longRunningProcess === true) {
    throw new Error(
      "Cannot use both 'timeoutMs' and 'longRunningProcess' options together. Use 'timeoutMs' for one-time tasks that need longer execution time, and 'longRunningProcess' for daemon processes that should continue running in the background."
    );
  }

  // Get session for hook execution if workerId available
  let session;
  if (context.workerId) {
    try {
      session = await getSession(context.workerId);
    } catch (e) {
      console.error('[command-execution] Failed to get session for hooks:', e);
      logSecurityError(context.workerId || 'unknown', 'get_session_for_hooks', e, {
        toolName: 'execute_command',
      });
    }
  }

  // Execute permission hooks for beforeShellExecution
  if (session) {
    try {
      const userId = session.initiator?.includes('#')
        ? session.initiator.split('#').pop()!
        : session.initiator || '';

      const permissionResult = await executePermissionHooks({
        sessionId: context.workerId || 'unknown',
        event: 'beforeShellExecution',
        userId,
        workingDirectory: input.cwd || process.cwd(),
        contextData: {
          command: input.command,
          sessionId: context.workerId,
        },
      });

      // Handle hook blocking
      if (permissionResult.permission === 'deny') {
        console.log('[command-execution] Command blocked by permission hook');
        logPermissionDenied(
          context.workerId || 'unknown',
          userId,
          'shell_command',
          'execute',
          permissionResult.userMessage || 'Command blocked by hook'
        );
        return JSON.stringify(
          {
            stdout: '',
            stderr: '',
            error: permissionResult.userMessage || 'Command blocked by hook',
            exitCode: 1,
          },
          undefined,
          1
        );
      }

      // Use modified command if provided
      if (permissionResult.updatedCommand) {
        console.log('[command-execution] Command modified by permission hook');
        logPermissionModified(
          context.workerId || 'unknown',
          input.command,
          permissionResult.updatedCommand,
          'Permission hook modification'
        );
        input.command = permissionResult.updatedCommand;
      }
    } catch (e) {
      console.error('[command-execution] beforeShellExecution permission hook failed:', e);
      logSecurityError(context.workerId || 'unknown', 'permission_hook_before_shell', e, {
        toolName: 'execute_command',
        command: input.command,
      });
      // Don't throw - fail-open and continue with command execution
    }
  }

  const startTime = Date.now();
  const res = await executeCommand(
    input.command,
    input.cwd,
    input.timeoutMs ?? 60000,
    input.longRunningProcess,
    context.toolUseId,
    context.cancellationToken
  );
  const durationMs = Date.now() - startTime;

  // Log tool execution result
  logToolExecution(
    context.workerId || 'unknown',
    'execute_command',
    res.exitCode === 0,
    {
      durationMs,
      exitCode: res.exitCode,
      longRunningProcess: input.longRunningProcess,
      timeoutMs: input.timeoutMs ?? 60000,
    }
  );

  // Execute afterShellExecution hook after command completes (whether successful or failed)
  if (session) {
    try {
      await executeHooksForEventWithSession(session, 'afterShellExecution', input.cwd || process.cwd(), {
        command: input.command,
        exitCode: res.exitCode,
      });
    } catch (e) {
      console.error('[command-execution] afterShellExecution hook failed:', e);
      logSecurityError(context.workerId || 'unknown', 'permission_hook_after_shell', e, {
        toolName: 'execute_command',
        command: input.command,
      });
      // Don't throw - hook errors don't affect command result
    }
  }

  return JSON.stringify(res, undefined, 1);
};

const name = 'execute_command';

export const commandExecutionTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name,
  handler,
  schema: inputSchema,
  toolSpec: async () => ({
    name,
    description: `Execute any shell command. If you need to run a command in a specific directory, set \`cwd\` argument (optional).

If you need to run a daemon or long-running process like \`npm run dev\` or \`docker compose up\`, set \`longRunningProcess: true\`. This will start the process, wait for 10 seconds to allow it to initialize, and return control to you while keeping the process running in the background.

For one-time tasks that you expect to take longer than 60 seconds to complete, set \`timeoutMs\` to a higher value (in milliseconds). For example, \`timeoutMs: 180000\` for a 3-minute timeout. Do NOT use this for daemon processes - use \`longRunningProcess: true\` instead.

IMPORTANT: When your command contains special characters (like backticks, quotes, dollar signs), they need to be properly escaped to prevent shell interpretation. Common approaches:
1. Use single quotes to prevent variable expansion and most interpretations: 'text with $HOME and \`backticks\`'
2. Escape special characters with backslash: "text with \\$HOME and \\\`backticks\\\`"

Some example commands:
* \`ls\`: list files in a directory
* \`cat\`: read the content of a file
* \`grep\`: search through contents in files
* \`gh\`: interact with GitHub API (it is already authorized)
  * \`gh issue view ISSUE_NUMBER\`: view a repository issue

IMPORTANT: Sometimes the tool result object contains "suggestion" property reflecting the command execution result. When you see it, you must follow the suggested actions.
`,
    inputSchema: {
      json: zodToJsonSchemaBody(inputSchema),
    },
  }),
};

// (async () => {
//   const res = await executeCommand('foo');
//   console.log(res);
// })();
