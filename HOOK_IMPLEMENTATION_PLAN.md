# Hook Implementation Plan

## Focus Areas

- **Hook Output Visibility** - Feed hook output to the agent
- **Blocking/Control Capability** - Allow hooks to block/modify actions

---

## 1. Hook Output Visibility

### Problem

Hook output is captured in `HookExecutionResult.logs` but never fed to the agent.

```typescript
// Current (broken):
await executeHooksForEventWithSession(session, 'sessionStart', ...);
// Result discarded! Agent never sees hook output.
```

### Solution

Inject hook output into the agent's context before its first turn.

### Implementation

#### Files to Modify

1. `packages/agent-core/src/lib/hook-execution.ts`
2. `packages/worker/src/agent/index.ts`
3. `packages/agent-core/src/lib/create-session.ts`

#### Changes

**Step 1: Enhance HookExecutionResult**

```typescript
// packages/agent-core/src/lib/hook-execution.ts
export interface HookExecutionResult {
  hooksExecuted: number;
  hooksSkipped: number;
  errors: Array<{ hookName: string; error: string }>;
  logs: Array<{ hookName: string; output: string }>;
  // NEW: Combined output for agent injection
  combinedOutput?: string;
}

// In executeHooksForEvent, after all hooks run:
result.combinedOutput = result.logs
  .filter(l => l.output.trim())
  .map(l => `[${l.hookName}]\n${l.output}`)
  .join('\n\n');
```

**Step 2: Capture and Inject in Worker**

```typescript
// packages/worker/src/agent/index.ts
export const onMessageReceived = async (...) => {
  await updateAgentStatusWithEvent(workerId, 'working');

  try {
    const { items } = await getConversationHistory(workerId);
    const isFirstTurn = items.length <= 1;

    // NEW: Collect hook output
    let hookContext = '';
    
    if (isFirstTurn) {
      const session = await getSession(workerId);
      const hookResult = await executeHooksForEventWithSession(
        session, 'sessionStart', process.cwd()
      );
      
      // NEW: Capture hook output for injection
      if (hookResult.combinedOutput) {
        hookContext = hookResult.combinedOutput;
      }
    }

    // NEW: Pass hook context to backend
    const { mode: inferenceMode, senderUserId } = await detectInferenceMode(workerId);
    const backend = bedrockBackend;
    await runTurnWithBackend(workerId, cancellationToken, backend, senderUserId, hookContext);
    
  } finally {
    // ...
  }
};
```

**Step 3: Inject as System Message**

```typescript
// packages/worker/src/agent/backends/bedrock.ts (or in runTurnWithBackend)

async function runTurnWithBackend(
  workerId: string,
  cancellationToken: CancellationToken,
  backend: Backend,
  senderUserId: string | undefined,
  hookContext?: string  // NEW parameter
) {
  const conversation = await buildConversation(workerId);
  
  // NEW: Inject hook context as system message
  if (hookContext) {
    conversation.unshift({
      role: 'system',
      content: `Hook Execution Output:\n${hookContext}`
    });
  }
  
  return await backend.run(conversation, ...);
}
```

### Testing

```typescript
// Test: Verify hook output appears in agent context
test('sessionStart hook output is visible to agent', async () => {
  // Create hook that outputs a reminder
  await createHook(userId, {
    name: 'title-reminder',
    event: 'sessionStart',
    command: 'echo "Remember to set session title"'
  });
  
  // Create session
  const sessionId = await createSession({
    message: 'Hello',
    initiator: `webapp#${userId}`,
    senderUserId: userId
  });
  
  // First turn should include hook output in system message
  const conversation = await getConversationHistory(sessionId);
  const systemMessage = conversation.items.find(m => m.role === 'system');
  expect(systemMessage?.content).toContain('Remember to set session title');
});
```

---

## 2. Blocking/Control Capability

### Problem

Hooks execute but cannot block or modify actions. They are "fire and forget".

### Solution

Allow permission hooks to return structured responses that control execution flow.

### Implementation

#### Files to Modify

1. `packages/agent-core/src/lib/hook-execution.ts`
2. `packages/agent-core/src/tools/command-execution/index.ts`
3. `packages/worker/src/agent/strands/to-strands-tool.ts`

#### Changes

**Step 1: New Hook Result Types**

```typescript
// packages/agent-core/src/lib/hook-execution.ts

export interface PermissionHookResult {
  continue: boolean;           // Whether to proceed
  permission: 'allow' | 'deny' | 'ask';  // Decision
  user_message?: string;       // Message to show user
  agent_message?: string;      // Message to show agent
  // For modifying inputs
  updated_command?: string;
  updated_tool_input?: object;
}

export interface HookExecutionResult {
  // ... existing fields ...
  // NEW: Permission result for blocking hooks
  permissionResult?: PermissionHookResult;
}
```

**Step 2: Execute Permission Hooks**

```typescript
// packages/agent-core/src/lib/hook-execution.ts

export async function executePermissionHooks(
  context: HookExecutionContext
): Promise<PermissionHookResult> {
  const hooks = await listHooksByEvent(context.userId, context.event);
  
  for (const hook of hooks) {
    try {
      const result = execSync(hook.command, {
        input: JSON.stringify(buildHookInput(context)),
        cwd: context.workingDirectory,
        env: buildHookEnv(context.contextData),
        timeout: 30000,
        encoding: 'utf-8'
      });
      
      // Parse JSON output
      const permissionResult: PermissionHookResult = JSON.parse(result);
      
      // If any hook denies, return immediately
      if (permissionResult.permission === 'deny') {
        return permissionResult;
      }
      
      // If any hook asks for confirmation, return
      if (permissionResult.permission === 'ask') {
        return permissionResult;
      }
      
      // Apply modifications
      if (permissionResult.updated_command) {
        context.contextData!.command = permissionResult.updated_command;
      }
      
    } catch (e) {
      // Log error but continue (fail-open for errors)
      console.error(`[hook-execution] Permission hook failed:`, e);
    }
  }
  
  // Default: allow
  return { continue: true, permission: 'allow' };
}
```

**Step 3: Integrate with Shell Execution**

```typescript
// packages/agent-core/src/tools/command-execution/index.ts

export const executeCommandTool: ToolDefinition<...> = {
  name: 'command_execution',
  handler: async (input, context) => {
    // NEW: Run permission hooks
    const hookResult = await executePermissionHooks({
      sessionId: context.workerId,
      event: 'beforeShellExecution',
      userId: extractUserIdFromSession(await getSession(context.workerId)),
      workingDirectory: input.cwd,
      contextData: {
        command: input.command,
        sessionId: context.workerId
      }
    });
    
    // NEW: Handle blocking
    if (hookResult.permission === 'deny') {
      return {
        type: 'error',
        message: hookResult.user_message || 'Command blocked by hook',
        details: hookResult.agent_message
      };
    }
    
    // NEW: Handle ask permission
    if (hookResult.permission === 'ask') {
      // Return confirmation request
      return {
        type: 'confirmation',
        message: hookResult.user_message || 'This command requires approval',
        command: hookResult.updated_command || input.command
      };
    }
    
    // Use potentially modified command
    const command = hookResult.updated_command || input.command;
    
    // Execute command...
    const result = await executeCommand(command, ...);
    
    // Run after hook
    await executeHooksForEventWithSession(...);
    
    return result;
  }
};
```

**Step 4: Integrate with Tool Execution**

```typescript
// packages/worker/src/agent/strands/to-strands-tool.ts

async function executeWithPermissionHooks(
  toolDef: ToolDefinition,
  toolInput: any,
  context: ExecutionContext
): Promise<any> {
  // Run preToolUse permission hooks
  const permissionResult = await executePermissionHooks({
    sessionId: context.workerId,
    event: 'preToolUse',
    userId: extractUserIdFromSession(context.session),
    contextData: {
      toolName: toolDef.name,
      sessionId: context.workerId
    }
  });
  
  if (permissionResult.permission === 'deny') {
    const error = new Error(
      permissionResult.user_message || `Tool "${toolDef.name}" blocked by hook`
    );
    error.name = 'HookBlockedError';
    throw error;
  }
  
  // Apply modified input
  if (permissionResult.updated_tool_input) {
    toolInput = { ...toolInput, ...permissionResult.updated_tool_input };
  }
  
  // Execute tool
  const result = await toolDef.handler(toolInput, context);
  
  // Run post hooks...
  return result;
}
```

### Example Hook Scripts

**Block Dangerous Commands:**

```bash
#!/bin/bash
# hooks/block-dangerous.sh

# Read JSON input
input=$(cat)
command=$(echo "$input" | jq -r '.context.command // empty')

# Check for dangerous patterns
if [[ "$command" =~ (rm\s+-rf\s+/|mkfs\.|dd\s+if=.*of=/dev/sda) ]]; then
  cat << EOF
{
  "continue": true,
  "permission": "deny",
  "user_message": "This command appears dangerous and has been blocked for safety.",
  "agent_message": "The command was blocked by a safety hook. Consider using safer alternatives."
}
EOF
  exit 2
fi

# Allow
exit 0
```

**Ask for Confirmation:**

```bash
#!/bin/bash
# hooks/ask-for-confirmation.sh

input=$(cat)
command=$(echo "$input" | jq -r '.context.command // empty')

# Check for write operations
if [[ "$command" =~ (kubectl\s+apply|terraform\s+apply|aws\s+.*delete) ]]; then
  cat << EOF
{
  "continue": true,
  "permission": "ask",
  "user_message": "This command will make changes to infrastructure. Confirm to proceed.",
  "agent_message": "Please confirm if you want to proceed with this infrastructure change."
}
EOF
  exit 0
fi

exit 0
```

### Testing

```typescript
test('beforeShellExecution can block commands', async () => {
  // Create blocking hook
  await createHook(userId, {
    name: 'block-rm',
    event: 'beforeShellExecution',
    command: 'bash hooks/block-rm.sh'
  });
  
  // Attempt to run blocked command
  const result = await executeCommandTool.handler({
    command: 'rm -rf /'
  }, context);
  
  // Should be blocked
  expect(result.type).toBe('error');
  expect(result.message).toContain('blocked');
});
```

---

## Implementation Order

### Phase 1: Hook Output Visibility (1-2 days)

1. Add `combinedOutput` to `HookExecutionResult`
2. Capture hook result in `onMessageReceived`
3. Inject as system message in conversation
4. Test with title reminder hook

### Phase 2: Blocking Foundation (2-3 days)

1. Add `PermissionHookResult` types
2. Implement `executePermissionHooks()`
3. Add JSON input/output to hooks
4. Test permission parsing

### Phase 3: Shell Execution Integration (1-2 days)

1. Integrate permission hooks into `command_execution` tool
2. Handle deny/ask responses
3. Support command modification
4. Add confirmation flow

### Phase 4: Tool Execution Integration (2-3 days)

1. Integrate permission hooks into `preToolUse`
2. Add tool input modification support
3. Handle tool blocking
4. Test with various tools

---

## API Changes

### New Types

```typescript
// HookResult.ts
export interface PermissionHookResult {
  continue: boolean;
  permission: 'allow' | 'deny' | 'ask';
  user_message?: string;
  agent_message?: string;
  updated_command?: string;
  updated_tool_input?: object;
}

export interface HookExecutionResult {
  hooksExecuted: number;
  hooksSkipped: number;
  errors: Array<{ hookName: string; error: string }>;
  logs: Array<{ hookName: string; output: string }>;
  combinedOutput?: string;
  permissionResult?: PermissionHookResult;
}
```

### New Functions

```typescript
// hook-execution.ts
export function executePermissionHooks(
  context: HookExecutionContext
): Promise<PermissionHookResult>;

export function buildHookInput(
  context: HookExecutionContext
): object;
```

---

## Migration Notes

### For Existing Hooks

- **Non-permission hooks** (sessionStart, afterFileEdit, etc.): No change needed
- **Permission hooks** (beforeShellExecution, preToolUse): Need to update to output JSON

### Backward Compatibility

```typescript
// Try to parse as JSON, fall back to empty allow
function parsePermissionResult(output: string): PermissionHookResult {
  try {
    return JSON.parse(output);
  } catch {
    // Legacy hooks return exit code 0 = allow
    return { continue: true, permission: 'allow' };
  }
}
```

---

## Success Criteria

### Hook Output Visibility

- [ ] `sessionStart` hook output appears in agent's first turn
- [ ] `subagentStart` hook output visible to parent agent
- [ ] Agent can see and respond to title reminders
- [ ] Hook output clearly marked in conversation

### Blocking/Control

- [ ] Hooks can return `{ permission: "deny" }` to block commands
- [ ] Hooks can return `{ permission: "ask" }` for confirmation
- [ ] Commands are actually blocked when hook denies
- [ ] User sees clear message explaining block
- [ ] Agent sees explanation of why action was blocked
- [ ] Hook errors don't break execution (fail-open)

---

## Related PRs

- PR #158: Fix API session initiator
- PR for Phase 1: Hook output visibility
- PR for Phase 2-4: Blocking capability