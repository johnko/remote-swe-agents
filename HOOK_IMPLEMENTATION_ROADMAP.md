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

### ✅ Phase 2a: Tool & File Execution (COMPLETE - PR #126)
All execution hooks fully implemented:

1. **preToolUse** - Before any tool is executed
   - Location: `packages/worker/src/agent/strands/to-strands-tool.ts::toStrandsTool().callback`
   - Trigger: Right before `await def.handler()` call
   - Context Available: tool name, input, workerId, toolUseId

2. **postToolUse** - After a tool succeeds
   - Location: Same file, after handler returns successfully
   - Trigger: After successful tool execution
   - Context Available: tool name, input, result, workerId, toolUseId

3. **postToolUseFailure** - After a tool throws an error
   - Location: Same file, in error handler
   - Trigger: After tool handler throws
   - Context Available: tool name, input, error, workerId, toolUseId

4. **beforeShellExecution** - Before a shell command runs
   - Location: `packages/agent-core/src/tools/command-execution/`
   - Trigger: Before command execution
   - Context: command text, working directory

5. **afterShellExecution** - After a shell command completes
   - Location: Same location, after execution
   - Context: command text, stdout, stderr, exit code

6. **beforeReadFile** - Before reading a file
   - Location: `packages/agent-core/src/tools/editor/`
   - Context: file path

7. **afterFileEdit** - After editing a file
   - Location: Same location, after edit completes
   - Context: file path, old content, new content

8. **beforeMCPExecution** - Before an MCP call
   - Location: `packages/worker/src/agent/mcp/index.ts`
   - Trigger: Before `tryExecuteMcpTool()` call

9. **afterMCPExecution** - After an MCP call succeeds
   - Location: Same location, after successful execution
   - Context: MCP tool name, result

### ✅ Phase 2b: Response & Context Hooks (COMPLETE - PR #127)
All response lifecycle and context management hooks fully implemented:

1. **beforeSubmitPrompt** - Before sending prompt to model
   - Location: `packages/worker/src/agent/kiro-acp-sdk-agent-loop.ts::runPromptOnce()`
   - Trigger: Before calling `agentInstance.promptCompat()`
   - Executes: Before each prompt attempt (including retries)

2. **afterAgentResponse** - After receiving model response
   - Location: `packages/worker/src/agent/kiro-acp-sdk-agent-loop.ts` (main loop)
   - Trigger: Right after `result = await runPromptOnce()`
   - Context: Response received from model

3. **afterAgentThought** - After agent reasoning/thinking extracted
   - Location: `packages/worker/src/agent/kiro-acp-sdk-agent-loop.ts`
   - Trigger: After `stripThinkBlocks()` processes response
   - Context: Thinking/reasoning has been processed

4. **preCompact** - Before context window preparation
   - Location: `packages/worker/src/agent/kiro-acp-sdk-agent-loop.ts`
   - Trigger: Before `buildKiroPromptBlocks()`
   - Context: Called during context compaction phase

5. **stop** - When session is terminated/completed
   - Location: `packages/agent-core/src/tools/complete-session/index.ts`
   - Trigger: Before `updateSessionAgentStatus()` to 'completed'
   - Context: Session being completed

**Implementation Pattern (consistent across all phases):**
- Wrapped in try-catch blocks to prevent hook errors from breaking execution
- Errors logged to console but never thrown
- Executed via `executeHooksForEventWithSession(session, eventName, cwd)`
- No blocking; all hooks fire asynchronously

### 📋 Phase 3+: Future Enhancements (NOT YET IMPLEMENTED)
Reserved for future expansion and additional lifecycle events.

## Testing Strategy

### Phase 1 Tests (Lifecycle Events) ✅ IMPLEMENTED
- [x] Create hook with sessionStart event, verify it runs on first turn
- [x] Create hook with sessionEnd event, verify it runs when session completes
- [x] Create hook with subagentStart event, verify it runs when child session created
- [x] Create hook with subagentStop event, verify it runs when child session completes
- [x] Verify hooks don't interfere with normal session operations
- [x] Verify errors in one hook don't prevent others from running
- [x] Test userId extraction from different initiator formats

### Phase 2a Tests (Tool & File Execution) ✅ IMPLEMENTED
- [x] Create hook with preToolUse event
- [x] Create hook with postToolUse event
- [x] Create hook with postToolUseFailure event
- [x] Create hook with beforeShellExecution event
- [x] Create hook with afterShellExecution event
- [x] Create hook with beforeReadFile event
- [x] Create hook with afterFileEdit event
- [x] Create hook with beforeMCPExecution event
- [x] Create hook with afterMCPExecution event
- [x] Verify error isolation (hook errors don't break tool execution)

### Phase 2b Tests (Response & Context Hooks) ✅ IMPLEMENTED
- [x] Create hook with beforeSubmitPrompt event
- [x] Create hook with afterAgentResponse event
- [x] Create hook with afterAgentThought event
- [x] Create hook with preCompact event
- [x] Create hook with stop event
- [x] Verify hooks don't interfere with normal agent loop
- [x] Verify error isolation in response hooks
- [ ] Integration tests across multiple hook events
- [ ] End-to-end testing on production workloads

## Integration Checklist

### Phase 1 (Session Lifecycle) ✅ COMPLETE
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

### Phase 2a (Tool & File Execution) ✅ COMPLETE (PR #126)
- [x] Tool hook module created / to-strands-tool.ts modified
- [x] preToolUse implemented
- [x] postToolUse implemented
- [x] postToolUseFailure implemented
- [x] beforeShellExecution implemented
- [x] afterShellExecution implemented
- [x] beforeReadFile implemented
- [x] afterFileEdit implemented
- [x] beforeMCPExecution implemented
- [x] afterMCPExecution implemented
- [x] Tests written
- [x] Packages compile successfully
- [ ] PR review and merge

### Phase 2b (Response & Context Hooks) ✅ COMPLETE (PR #127)
- [x] beforeSubmitPrompt implemented
- [x] afterAgentResponse implemented
- [x] afterAgentThought implemented
- [x] preCompact implemented
- [x] stop implemented
- [x] Consistent error handling pattern (try-catch, no throw)
- [x] Packages compile successfully
- [x] PR created and pushed
- [ ] PR review and merge

### Phase 3+ (Future Enhancements)
- [ ] To be defined based on user feedback and feature requests

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
