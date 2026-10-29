import { execSync } from 'child_process';
import { AnyHookPayload, HookExecutionType, HookResponse, HookPermission, RegisteredHook, HookExecutionResult } from './types.js';

/**
 * Hook executor handles the execution of registered hooks
 */
export class HookExecutor {
  /**
   * Execute a single hook with the given payload
   */
  async execute(hook: RegisteredHook, payload: AnyHookPayload): Promise<HookExecutionResult> {
    const startTime = Date.now();
    const timeout = hook.timeout || 5000;

    try {
      let response: HookResponse | undefined;

      switch (hook.type) {
        case HookExecutionType.COMMAND:
          response = await this.executeCommand(hook, payload, timeout);
          break;
        case HookExecutionType.FUNCTION:
          response = await this.executeFunction(hook, payload, timeout);
          break;
        default:
          throw new Error(`Unknown hook type: ${hook.type}`);
      }

      const duration = Date.now() - startTime;

      return {
        hookId: hook.id,
        event: payload.event,
        success: true,
        duration,
        response,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Hook execution failed: ${hook.name} (${hook.id})`, error);

      return {
        hookId: hook.id,
        event: payload.event,
        success: false,
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Execute multiple hooks sequentially, stopping on first blocking denial
   */
  async executeHooks(
    hooks: RegisteredHook[],
    payload: AnyHookPayload
  ): Promise<{ allowed: boolean; results: HookExecutionResult[]; reason?: string }> {
    const results: HookExecutionResult[] = [];

    for (const hook of hooks) {
      const result = await this.execute(hook, payload);
      results.push(result);

      // If this is a blocking hook and it denied, stop execution
      if (hook.blocking && result.response?.permission === HookPermission.DENY) {
        return {
          allowed: false,
          results,
          reason: result.response.reason,
        };
      }

      // If hook failed and is blocking, treat as denial
      if (hook.blocking && !result.success) {
        return {
          allowed: false,
          results,
          reason: `Hook ${hook.name} failed: ${result.error?.message}`,
        };
      }
    }

    return {
      allowed: true,
      results,
    };
  }

  /**
   * Execute a command-based hook
   */
  private async executeCommand(hook: RegisteredHook, payload: AnyHookPayload, timeout: number): Promise<HookResponse> {
    if (!hook.command) {
      throw new Error(`Hook ${hook.name} is missing command property`);
    }

    const jsonInput = JSON.stringify(payload);

    try {
      const result = execSync(hook.command, {
        input: jsonInput,
        encoding: 'utf-8',
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      const response = JSON.parse(result) as HookResponse;
      return response;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
        throw new Error(`Hook ${hook.name} timed out after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Execute a function-based hook (for development/testing)
   */
  private async executeFunction(
    hook: RegisteredHook,
    payload: AnyHookPayload,
    _timeout: number
  ): Promise<HookResponse> {
    if (!hook.function) {
      throw new Error(`Hook ${hook.name} is missing function property`);
    }

    // For now, function-based hooks would need to be injected via dependency injection
    // This is a placeholder for future implementation
    console.warn(`Function-based hooks not yet implemented: ${hook.name}`);

    return {
      permission: HookPermission.ALLOW,
    };
  }
}

/**
 * Global hook executor instance
 */
let globalExecutor: HookExecutor | null = null;

/**
 * Get or create global hook executor
 */
export function getGlobalHookExecutor(): HookExecutor {
  if (!globalExecutor) {
    globalExecutor = new HookExecutor();
  }
  return globalExecutor;
}
