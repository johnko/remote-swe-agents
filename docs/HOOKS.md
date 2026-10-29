# Hooks System

Hooks let you observe, control, and extend the rswea agent lifecycle using custom scripts. This document covers how to define, register, and use hooks in rswea.

## Overview

Hooks are custom scripts that fire at specific lifecycle points in rswea's agent execution. They can:

- **Observe** agent behavior (logging, analytics, auditing)
- **Block** risky operations (security gates)
- **Modify** behavior (context injection, transformations)

Hooks are inspired by [Cursor's hooks system](https://cursor.com/docs/hooks) and adapted for rswea's agent architecture.

## Hook Lifecycle Events

### Session Lifecycle

- **`sessionStart`** - Fires when an agent session begins
- **`sessionEnd`** - Fires when an agent session terminates
  - Payload includes `duration` (milliseconds)

### Tool Execution

- **`toolBefore`** - Fires before any tool execution (blocking point)
- **`toolAfter`** - Fires after successful tool execution
- **`toolError`** - Fires when tool execution fails

### Message Handling

- **`messageReceived`** - Fires when user/agent message arrives
- **`messageSent`** - Fires before response sent to user

### Worker Lifecycle

- **`workerStart`** - Fires when worker instance starts
- **`workerStop`** - Fires when worker instance stops

### Agent Lifecycle

- **`agentStart`** - Fires when agent session begins execution
- **`agentEnd`** - Fires when agent session completes

## Hook Configuration

Define hooks in `.cursor/hooks.json` at the project root:

```json
{
  "hooks": [
    {
      "name": "my-hook",
      "description": "What this hook does",
      "event": "sessionStart",
      "type": "command",
      "command": "bash ./scripts/my-hook.sh",
      "blocking": false,
      "timeout": 5000,
      "enabled": true
    }
  ]
}
```

### Configuration Fields

- **`name`** *(required, string)* - Unique hook name (lowercase, alphanumeric, hyphens)
- **`description`** *(optional, string)* - Hook description
- **`event`** *(required, string or array)* - Event(s) that trigger the hook
  - Single event: `"sessionStart"`
  - Multiple events: `["sessionStart", "sessionEnd"]`
- **`type`** *(required, string)* - Execution type: `"command"` or `"function"`
- **`command`** *(required for command hooks, string)* - Shell command to execute
- **`function`** *(required for function hooks, string)* - Function path (future)
- **`blocking`** *(optional, boolean)* - Whether hook can block execution (default: `false`)
- **`timeout`** *(optional, number)* - Hook timeout in milliseconds (default: `5000`)
- **`enabled`** *(optional, boolean)* - Whether hook is active (default: `true`)

## Execution Model

### Command-Based Hooks

Command hooks are shell scripts that communicate via JSON over stdin/stdout:

```bash
#!/bin/bash
PAYLOAD=$(cat)  # Read JSON payload from stdin

# Process payload
TOOL_NAME=$(echo "$PAYLOAD" | jq -r '.toolName')

# Return JSON response
cat <<EOF
{
  "permission": "allow"
}
EOF
```

**Exit code behavior:**

- Exit code `0` - Hook succeeded, use JSON output
  - For blocking hooks: `deny` in response blocks the action
  - For non-blocking: observation-only
- Exit code `2` - Explicitly deny the action
- Other exit codes - Hook failed, action proceeds (fail-open)

### Payload Structure

All hooks receive a JSON payload via stdin:

```json
{
  "event": "toolBefore",
  "timestamp": 1731329875123,
  "sessionId": "session-123",
  "toolName": "execute_command",
  "toolInput": {
    "command": "ls -la"
  }
}
```

### Response Structure

Hooks return a JSON response via stdout:

```json
{
  "permission": "allow",
  "reason": "Tool execution allowed",
  "modified": false
}
```

**Response fields:**

- **`permission`** - `"allow"` or `"deny"`
- **`reason`** *(optional)* - Why the hook took this action
- **`modified`** *(optional)* - Whether payload was modified

## Hook Response Handling

### Non-Blocking Hooks (Observation)

Passive observation hooks don't affect execution:

```bash
#!/bin/bash
# Log tool usage
PAYLOAD=$(cat)
TOOL=$(echo "$PAYLOAD" | jq -r '.toolName')
echo "[$(date)] Tool: $TOOL" >> /tmp/audit.log

cat <<EOF
{ "permission": "allow" }
EOF
```

### Blocking Hooks (Permission Gates)

Blocking hooks can prevent actions:

```bash
#!/bin/bash
PAYLOAD=$(cat)
COMMAND=$(echo "$PAYLOAD" | jq -r '.toolInput.command')

# Block dangerous patterns
if echo "$COMMAND" | grep -q "rm -rf"; then
  cat <<EOF
{
  "permission": "deny",
  "reason": "Dangerous command blocked"
}
EOF
else
  cat <<EOF
{ "permission": "allow" }
EOF
fi
```

## Example Hooks

### 1. Audit Tool Usage

Log all tool executions for compliance:

```bash
#!/bin/bash
PAYLOAD=$(cat)
TOOL=$(echo "$PAYLOAD" | jq -r '.toolName')
SESSION=$(echo "$PAYLOAD" | jq -r '.sessionId')
TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "$TIME | TOOL=$TOOL | SESSION=$SESSION" >> /var/log/rswea/audit.log

echo '{"permission":"allow"}'
```

**Configuration:**

```json
{
  "name": "audit-tools",
  "event": ["toolBefore", "toolAfter"],
  "type": "command",
  "command": "bash ./hooks/audit.sh",
  "blocking": false
}
```

### 2. Block Dangerous Operations

Prevent risky commands:

```bash
#!/bin/bash
PAYLOAD=$(cat)
COMMAND=$(echo "$PAYLOAD" | jq -r '.toolInput.command // ""')

DANGEROUS_PATTERNS="rm -rf|dd if=/dev|sudo mkfs|curl.*\| bash"

if echo "$COMMAND" | grep -qE "$DANGEROUS_PATTERNS"; then
  echo '{"permission":"deny","reason":"Dangerous pattern blocked"}'
  exit 0
fi

echo '{"permission":"allow"}'
```

**Configuration:**

```json
{
  "name": "block-dangerous",
  "event": "toolBefore",
  "type": "command",
  "command": "bash ./hooks/security.sh",
  "blocking": true,
  "timeout": 3000
}
```

### 3. Session Cost Tracking

Monitor session costs and duration:

```bash
#!/bin/bash
PAYLOAD=$(cat)
EVENT=$(echo "$PAYLOAD" | jq -r '.event')
SESSION=$(echo "$PAYLOAD" | jq -r '.sessionId')
DURATION=$(echo "$PAYLOAD" | jq -r '.duration // 0')

if [ "$EVENT" = "sessionEnd" ]; then
  SECONDS=$(echo "$DURATION" | awk '{print int($1 / 1000)}')
  echo "Session $SESSION completed in $SECONDS seconds" >> /var/log/rswea/costs.log
fi

echo '{"permission":"allow"}'
```

**Configuration:**

```json
{
  "name": "track-costs",
  "event": ["sessionStart", "sessionEnd"],
  "type": "command",
  "command": "bash ./hooks/costs.sh"
}
```

## Best Practices

### Performance

- Keep hooks fast (< 100ms for non-blocking)
- Use `timeout` to prevent hanging
- Avoid expensive I/O in blocking hooks
- Log asynchronously if needed

### Security

- Sanitize inputs carefully
- Don't expose secrets in logs
- Use blocking hooks for permission gates
- Test hooks thoroughly

### Reliability

- Handle edge cases gracefully
- Return valid JSON always
- Use fail-open for non-critical hooks
- Add logging for debugging

### Composition

- One concern per hook
- Use multiple hooks for complex policies
- Order hooks by criticality
- Document hook dependencies

## Programmatic API

You can also register hooks programmatically in your code:

```typescript
import {
  HookRegistry,
  HookEvent,
  HookExecutionType,
  initializeHookRegistry,
} from '@remote-swe-agents/agent-core';

// Initialize from .cursor/hooks.json
const registry = await initializeHookRegistry();

// Or register hooks programmatically
registry.register({
  name: 'my-hook',
  event: HookEvent.SESSION_START,
  type: HookExecutionType.COMMAND,
  command: 'bash ./hooks/my-hook.sh',
  blocking: false,
  timeout: 5000,
});

// Get hooks for an event
const hooks = registry.getHooksForEvent(HookEvent.TOOL_BEFORE);

// Get statistics
const stats = registry.getStats();
console.log(`Total hooks: ${stats.total}, Blocking: ${stats.blocking}`);
```

## Lifecycle Integration

Hooks are integrated into rswea's core lifecycle points:

### Session Management

- `createSession()` → `sessionStart` hook
- `deleteSession()` → `sessionEnd` hook

### Tool Execution

- Before tool execution → `toolBefore` hook (can block)
- After tool execution → `toolAfter` hook
- On tool error → `toolError` hook

### Worker Management

- Worker instance starts → `workerStart` hook
- Worker instance stops → `workerStop` hook

### Agent Execution

- Agent begins → `agentStart` hook
- Agent completes → `agentEnd` hook

## Troubleshooting

### Hook not firing

1. Check `.cursor/hooks.json` exists and is valid JSON
2. Verify hook is `enabled: true`
3. Check hook event matches the lifecycle point
4. Review rswea logs for hook registration

### Hook timing out

1. Increase `timeout` value
2. Profile hook command for performance
3. Check for blocking I/O in hook
4. Run hook manually to debug

### Hook blocking legitimate operations

1. Review hook's permission logic
2. Check hook payload for correct fields
3. Add logging to debug decision
4. Consider making hook non-blocking

## FAQ

**Q: Can hooks modify the payload?**
A: Currently, hooks can deny but not modify payloads. Future versions may support payload transformation.

**Q: How are multiple hooks ordered?**
A: Blocking hooks execute first in registration order. Blocking hook denial stops execution immediately.

**Q: Can hooks make HTTP requests?**
A: Yes! Use `curl` in your bash hook. Just ensure the timeout is sufficient.

**Q: Are hooks secure against injection?**
A: Hooks run in the same context as rswea. Treat them like code - they have full access.

**Q: How can I test hooks locally?**
A: Run hook commands manually and pipe JSON payloads via stdin.

## Related

- [Cursor Hooks Documentation](https://cursor.com/docs/hooks)
- [rswea Agent Architecture](./ARCHITECTURE.md)
- [Tool System](./TOOLS.md)
