import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { HookDefinition, HookEvent, RegisteredHook, hooksConfigSchema } from './types.js';

/**
 * Hook registry manages hook registration, lookup, and configuration
 */
export class HookRegistry {
  private hooks: Map<string, RegisteredHook> = new Map();
  private hooksByEvent: Map<HookEvent, RegisteredHook[]> = new Map();
  private configPath: string;

  constructor(configPath: string = '.cursor/hooks.json') {
    this.configPath = configPath;
    // Initialize event map
    Object.values(HookEvent).forEach((event) => {
      this.hooksByEvent.set(event, []);
    });
  }

  /**
   * Load hooks from .cursor/hooks.json configuration file
   */
  async loadFromFile(projectRoot: string = process.cwd()): Promise<void> {
    try {
      const configFilePath = resolve(projectRoot, this.configPath);
      const content = await readFile(configFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      const config = hooksConfigSchema.parse(parsed);

      for (const hookDef of config.hooks) {
        this.register(hookDef);
      }
      console.log(`Loaded ${config.hooks.length} hooks from ${configFilePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log(`No hooks.json found at ${this.configPath}, continuing without hooks`);
      } else {
        console.error('Error loading hooks configuration:', error);
      }
    }
  }

  /**
   * Register a hook programmatically
   */
  register(hookDef: HookDefinition): string {
    const hookId = `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!hookDef.enabled) {
      return hookId;
    }

    const registered: RegisteredHook = {
      ...hookDef,
      id: hookId,
      registeredAt: Date.now(),
    };

    this.hooks.set(hookId, registered);

    // Index by events
    const events = Array.isArray(hookDef.event) ? hookDef.event : [hookDef.event];
    events.forEach((event) => {
      const current = this.hooksByEvent.get(event) || [];
      current.push(registered);
      this.hooksByEvent.set(event, current);
    });

    console.log(`Registered hook: ${hookDef.name} (${hookId})`);
    return hookId;
  }

  /**
   * Get all hooks for a specific event
   */
  getHooksForEvent(event: HookEvent): RegisteredHook[] {
    return this.hooksByEvent.get(event) || [];
  }

  /**
   * Get a specific hook by ID
   */
  getHookById(hookId: string): RegisteredHook | undefined {
    return this.hooks.get(hookId);
  }

  /**
   * Get all registered hooks
   */
  getAllHooks(): RegisteredHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Unregister a hook
   */
  unregister(hookId: string): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;

    this.hooks.delete(hookId);

    // Remove from event index
    const events = Array.isArray(hook.event) ? hook.event : [hook.event];
    events.forEach((event) => {
      const current = this.hooksByEvent.get(event) || [];
      this.hooksByEvent.set(
        event,
        current.filter((h) => h.id !== hookId)
      );
    });

    console.log(`Unregistered hook: ${hook.name} (${hookId})`);
    return true;
  }

  /**
   * Get blocking hooks for an event (useful for permission checks)
   */
  getBlockingHooksForEvent(event: HookEvent): RegisteredHook[] {
    return this.getHooksForEvent(event).filter((h) => h.blocking);
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this.hooks.clear();
    this.hooksByEvent.forEach((arr) => arr.length = 0);
  }

  /**
   * Get statistics about registered hooks
   */
  getStats(): {
    total: number;
    byEvent: Record<string, number>;
    blocking: number;
  } {
    const byEvent: Record<string, number> = {};
    this.hooksByEvent.forEach((hooks, event) => {
      byEvent[event] = hooks.length;
    });

    const blocking = Array.from(this.hooks.values()).filter((h) => h.blocking).length;

    return {
      total: this.hooks.size,
      byEvent,
      blocking,
    };
  }
}

/**
 * Global hook registry instance
 */
let globalRegistry: HookRegistry | null = null;

/**
 * Get or create global hook registry
 */
export function getGlobalHookRegistry(): HookRegistry {
  if (!globalRegistry) {
    globalRegistry = new HookRegistry();
  }
  return globalRegistry;
}

/**
 * Initialize global hook registry from configuration
 */
export async function initializeHookRegistry(projectRoot: string = process.cwd()): Promise<HookRegistry> {
  const registry = getGlobalHookRegistry();
  await registry.loadFromFile(projectRoot);
  return registry;
}
