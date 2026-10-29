import type { ToolDefinition } from '../private/common/lib/index.js';

import { createPRTool } from '../tools/create-pr/index.js';
import { createNewSessionTool } from '../tools/create-session/index.js';
import { createEventTriggerTool, listEventTriggersTool, deleteEventTriggerTool } from '../tools/event-trigger/index.js';
import { ciTool } from '../tools/ci/index.js';
import { getPRCommentsTool, replyPRCommentTool, addIssueCommentTool } from '../tools/github-comments/index.js';
import { listAgentsTool, getAgentTool, createAgentTool, updateAgentTool, deleteAgentTool } from '../tools/manage-agent/index.js';
import { listSkillsTool, getSkillTool, createSkillTool, updateSkillTool, deleteSkillTool } from '../tools/manage-skill/index.js';
import {
  listLessonsTool,
  getLessonTool,
  createLessonTool,
  updateLessonTool,
  deleteLessonTool,
} from '../tools/manage-memory/index.js';
import { cloneRepositoryTool } from '../tools/repo/index.js';
import { reportProgressTool } from '../tools/report-progress/index.js';
import { sendFileTool } from '../tools/send-file/index.js';
import { sendToAgentTool } from '../tools/send-to-agent/index.js';
import { acknowledgeAgentTool } from '../tools/acknowledge-agent/index.js';
import { confirmSendToUserTool } from '../tools/confirm-send-to-user/index.js';
import { confirmSendFileToUserTool } from '../tools/confirm-send-file-to-user/index.js';
import { todoInitTool, todoUpdateTool } from '../tools/todo/index.js';
import { updateSessionTitleTool } from '../tools/session-title/index.js';
import { thinkTool } from '../tools/think/index.js';
import { waitForConditionTool } from '../tools/wait-for/index.js';
import { completeSessionTool } from '../tools/complete-session/index.js';
import { confirmCompleteSessionTool } from '../tools/confirm-complete-session/index.js';
import { confirmCreateAgentTool } from '../tools/confirm-create-agent/index.js';
import { listSessionsTool } from '../tools/list-sessions/index.js';
import { reparentSessionTool } from '../tools/reparent-session/index.js';
import { searchSessionsTool } from '../tools/search-sessions/index.js';
import { exportSessionDiagnosticsTool } from '../tools/export-session-diagnostics/index.js';

/**
 * Tools exposed to Kiro sessions as an MCP server.
 *
 * Explicitly excluded because kiro-cli already ships equivalents:
 *   - executeCommand (kiro-cli's execute_bash)
 *   - fileEdit (kiro-cli's fs_write_file)
 *   - readLocalImage (kiro-cli's read_image)
 *
 * Everything else in `agent-core/tools` is remote-swe-specific:
 *   - user / agent messaging (sendMessageToUser family, agent-to-agent)
 *   - repo / GitHub operations (cloneRepository, PR/CI/comments)
 *   - agent lifecycle (createAgent / updateAgent / …)
 *   - session lifecycle (createNewSession, completeSession/confirmCompleteSession, event triggers, todo, title)
 *   - UI-oriented helpers (sendFileToUser, confirmSendToUser, think)
 */
export const kiroExportedTools: ToolDefinition<unknown>[] = [
  // user-facing messaging / files
  reportProgressTool,
  confirmSendToUserTool,
  sendFileTool,
  confirmSendFileToUserTool,
  // agent-to-agent
  sendToAgentTool,
  acknowledgeAgentTool,
  createNewSessionTool,
  // repo + GitHub
  cloneRepositoryTool,
  ciTool,
  createPRTool,
  getPRCommentsTool,
  replyPRCommentTool,
  addIssueCommentTool,
  // agent management
  listAgentsTool,
  getAgentTool,
  createAgentTool,
  updateAgentTool,
  deleteAgentTool,
  // skill management
  listSkillsTool,
  getSkillTool,
  createSkillTool,
  updateSkillTool,
  deleteSkillTool,
  // lesson (memory) management
  listLessonsTool,
  getLessonTool,
  createLessonTool,
  updateLessonTool,
  deleteLessonTool,
  // event triggers
  createEventTriggerTool,
  listEventTriggersTool,
  deleteEventTriggerTool,
  // workflow / state
  todoInitTool,
  todoUpdateTool,
  updateSessionTitleTool,
  thinkTool,
  // async waiting (no kiro-cli equivalent; replaces blocking sleep loops)
  waitForConditionTool,
  // session lifecycle
  completeSessionTool,
  confirmCompleteSessionTool,
  confirmCreateAgentTool,
  listSessionsTool,
  reparentSessionTool,
  searchSessionsTool,
  exportSessionDiagnosticsTool,
] as unknown as ToolDefinition<unknown>[];

/** Tool names exposed over MCP. Used for tests / debugging. */
export const kiroExportedToolNames = kiroExportedTools.map((t) => t.name);
