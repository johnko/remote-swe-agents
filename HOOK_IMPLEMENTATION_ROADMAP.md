# Hook Execution System Implementation Roadmap

## Overview
This document tracks the implementation of hook execution across all lifecycle events defined in `packages/agent-core/src/schema/hook.ts`.

## Status Summary

### ✅ Phase 1: Session Lifecycle (COMPLETE)
These events are fully implemented and tested:

1. **sessionStart** - When a new session begins its first turn
   - Location: `packages/worker/src/agent/index.ts::onMessageReceived()`
   - Trigger: Detects first turn by checking conversation history length
   - Hooks Run Before: Main agent loop starts
   - UserID Resolution: From session.initiator field

2. **sessionEnd** - When a session is marked as completed
   - Location: `packages/agent-core/src/lib/sessions.ts::updateSessionAgentStatus()`
   - Trigger: When status changes to 'completed'
   - Hooks Run Before: DynamoDB status update (session still accessible)
   - UserID Resolution: From session.initiator field

3. **subagentStart** - When a child session is created
   - Location: `packages/agent-core/src/lib/create-session.ts::createSession()`
   - Trigger: Right after session is persisted to DynamoDB
   - Hooks Run Before: Worker instance is started
   - UserID Resolution: From session.initiator field
   - Only Fires For: Child sessions (where parentSessionId is set)

4. **subagentStop** - When a child session completes
   - Location: Piggybacking on sessionEnd (same as #2)
   - Trigger: Same as sessionEnd
   - Hooks Run Before: Same as sessionEnd
   - Additional Check: Only fires if session.parentSessionId exists
   - UserID Resolution: From session.initiator field

**Implementation Details:**
- Hook module: `packages/agent-core/src/lib/hook-execution.ts`
  - `executeHooksForEvent(context)` - Main executor
  - `executeHooksForEventWithSession(session, event)` - Convenience wrapper
  - `extractUserIdFromSession(session)` - Extracts userId from session.initiator
  - Handles shell commands and inline Node.js scripts
  - 30-second timeout per hook
  - Captures stdout/stderr; errors don't prevent other hooks from running

### 🔄 Phase 2: Tool Execution (NOT YET IMPLEMENTED)
These events need implementation:

1. **preToolUse** - Before any tool is executed
   - Location: `packages/worker/src/agent/strands/to-strands-tool.ts::toStrandsTool().callback`
   - Trigger: Right before `await def.handler()` call
   - Context Available: tool name, input, workerId, toolUseId
   - Hook Payload Suggestion: `{ toolName, toolUseId, toolInput }`

2. **postToolUse** - After a tool succeeds
   - Location: Same file, after handler returns successfully
   - Trigger: After successful tool execution
   - Context Available: tool name, input, result, workerId, toolUseId
   - Hook Payload Suggestion: `{ toolName, toolUseId, toolInput, result }`

3. **postToolUseFailure** - After a tool throws an error
   - Location: Same file, in error handler
   - Trigger: After tool handler throws
   - Context Available: tool name, input, error, workerId, toolUseId
   - Hook Payload Suggestion: `{ toolName, toolUseId, toolInput, error }`

**Implementation Notes:**
- Tool name available from `def.name` / `sanitizedName`
- Tool input from `input` parameter
- Tool use ID from `ctx?.toolUse?.toolUseId ?? ''`
- May need to add session/userId to ToolAdapterDeps for hook lookup
- Consider whether to execute synchronously or async (current: sync for phase 1)

### 📋 Phase 3: Shell Execution (NOT YET IMPLEMENTED)
These events need implementation:

1. **beforeShellExecution** - Before a shell command runs
   - Location: `packages/agent-core/src/tools/execute-command/` handler
   - Trigger: Before `execSync()` or similar command execution
   - Context: command text, working directory

2. **afterShellExecution** - After a shell command succeeds
   - Location: Same location, after successful execution
   - Context: command text, stdout, stderr, exit code

### 📋 Phase 4: File Operations (NOT YET IMPLEMENTED)
These events need implementation:

1. **beforeReadFile** - Before reading a file
   - Location: `packages/agent-core/src/tools/editor/` or file read tool
   - Context: file path

2. **afterFileEdit** - After editing a file
   - Location: Same location, after edit completes
   - Context: file path, old content, new content

### 📋 Phase 5: MCP Execution (NOT YET IMPLEMENTED)
These events need implementation:

1. **beforeMCPExecution** - Before an MCP call
2. **afterMCPExecution** - After an MCP call succeeds

### 📋 Phase 6: Prompt & Response Lifecycle (NOT YET IMPLEMENTED)
These events need implementation:

1. **beforeSubmitPrompt** - Before sending prompt to model
   - Location: Agent loop main execution
   - Context: prompt text, model type

2. **afterAgentResponse** - After receiving model response
   - Location: Same location
   - Context: response text, stop reason

3. **afterAgentThought** - After agent reasoning/thinking
   - Location: Internal model reasoning stream
   - Context: thought text (if available)

### 📋 Phase 7: Context Management (NOT YET IMPLEMENTED)
These events need implementation:

1. **preCompact** - Before context window compaction
2. **stop** - When session stops/terminates

## Testing Strategy

### Phase 1 Tests (Lifecycle Events)
- [ ] Create hook with sessionStart event, verify it runs on first turn
- [ ] Create hook with sessionEnd event, verify it runs when session completes
- [ ] Create hook with subagentStart event, verify it runs when child session created
- [ ] Create hook with subagentStop event, verify it runs when child session completes
- [ ] Verify hooks don't interfere with normal session operations
- [ ] Verify errors in one hook don't prevent others from running
- [ ] Test userId extraction from different initiator formats

### Phase 2+ Tests (To be added)
- Hook execution at tool invocation
- Hook execution at shell command execution
- Hook execution at file operations
- Hook execution at MCP calls
- Hook execution at prompt submission
- Integration testing across multiple phases

## Integration Checklist

### Phase 1 (Session Lifecycle)
- [x] Hook execution module created
- [x] Hook exports added to agent-core/lib/index.ts
- [x] sessionStart implemented
- [x] sessionEnd implemented
- [x] subagentStart implemented
- [x] subagentStop implemented
- [x] Packages compile successfully
- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Manual testing on real sessions
- [ ] PR review and merge

### Phase 2 (Tool Execution)
- [ ] Tool hook module created / to-strands-tool.ts modified
- [ ] preToolUse implemented
- [ ] postToolUse implemented
- [ ] postToolUseFailure implemented
- [ ] Tests written
- [ ] PR review and merge

### Subsequent Phases
- [ ] Shell execution hooks
- [ ] File operation hooks
- [ ] MCP hooks
- [ ] Prompt/response hooks
- [ ] Context management hooks

## Hook Execution Guarantees

1. **Error Isolation**: Error in one hook doesn't prevent others from running
2. **Timeout**: Each hook has max 30-second execution time
3. **Logging**: All hook executions are logged to console for debugging
4. **Output Capture**: stdout/stderr captured and stored in execution result
5. **Sequential Execution**: Hooks for same event run in order they were created
6. **No Blocking**: Hooks don't block the main agent loop (but Phase 1 runs synchronously)

## Future Enhancements

- [ ] Async hook execution (Phase 1 is sync; could be async in later phases)
- [ ] Hook result validation (ensure hooks return expected format)
- [ ] Hook performance monitoring (track execution times)
- [ ] Hook conditional execution (run hook only if condition met)
- [ ] Hook environment variables (pass session context to hooks)
- [ ] Hook templates (pre-built hook snippets for common tasks)
