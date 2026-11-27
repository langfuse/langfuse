import Router from "next/router";
import {
  IN_APP_AGENT_CREATE_SKILL_FROM_DRAFT_TOOL_NAME,
  IN_APP_AGENT_EDIT_SKILL_DRAFT_TOOL_NAME,
  IN_APP_AGENT_READ_SKILL_DRAFT_TOOL_NAME,
  InAppAgentCreateSkillFromDraftArgsSchema,
  InAppAgentEditSkillDraftArgsSchema,
  InAppAgentReadSkillDraftArgsSchema,
  InAppAgentRunStatus,
  isInAppAgentBrowserToolName,
  type AgUiMessage,
  type InAppAgentBrowserToolName,
} from "@langfuse/shared/in-app-agent";
import { safeJsonParse } from "@langfuse/shared";
import { type BackgroundExecutionRunView } from "@/src/features/in-app-agent/lib/backgroundExecutionSession";
import { type api } from "@/src/utils/api";

/**
 * Browser tools: Halo's run ends on the call, and the user's browser runs the
 * tool and reports the result, which continues the conversation.
 */

export type OpenBrowserToolCall = {
  runId: string;
  toolCallId: string;
  toolName: InAppAgentBrowserToolName;
  /** The call's arguments as the model wrote them, in JSON. */
  arguments: string;
};

/**
 * The browser tool call the latest run ended on, if it has no result yet. A
 * run that ends on a browser tool call ends with it, so it sits in the last
 * assistant message.
 */
export function getOpenBrowserToolCall(view: {
  messages: readonly AgUiMessage[];
  currentRun: BackgroundExecutionRunView | null;
}): OpenBrowserToolCall | null {
  const run = view.currentRun;
  if (run?.status !== InAppAgentRunStatus.SUCCEEDED) {
    return null;
  }

  const lastAssistantIndex = view.messages.findLastIndex(
    (message) => message.role === "assistant",
  );
  const lastAssistant = view.messages[lastAssistantIndex];
  if (lastAssistant?.role !== "assistant") {
    return null;
  }

  const answeredToolCallIds = new Set(
    view.messages
      .slice(lastAssistantIndex + 1)
      .flatMap((message) =>
        message.role === "tool" ? [message.toolCallId] : [],
      ),
  );
  const toolCall = lastAssistant.toolCalls?.find(
    (call) =>
      isInAppAgentBrowserToolName(call.function.name) &&
      !answeredToolCallIds.has(call.id),
  );
  if (!toolCall || !isInAppAgentBrowserToolName(toolCall.function.name)) {
    return null;
  }
  return {
    runId: run.id,
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    arguments: toolCall.function.arguments,
  };
}

/** Edits and reads of the draft run without a click; saving needs one. */
export function runsWithoutConfirmation(toolName: InAppAgentBrowserToolName) {
  return toolName !== IN_APP_AGENT_CREATE_SKILL_FROM_DRAFT_TOOL_NAME;
}

// Runs this tab started, so only that tab runs their browser tools on its
// own. Other tabs hold a different draft and only offer to take over.
const TAB_RUNS_STORAGE_KEY = "langfuse:in-app-agent-tab-runs";
const MAX_TAB_RUNS = 50;

export function markRunStartedInThisTab(runId: string) {
  try {
    const runIds = readTabRunIds().filter((id) => id !== runId);
    sessionStorage.setItem(
      TAB_RUNS_STORAGE_KEY,
      JSON.stringify([...runIds, runId].slice(-MAX_TAB_RUNS)),
    );
  } catch {
    // Without storage, the tab offers to run tools instead of running them.
  }
}

export function wasRunStartedInThisTab(runId: string) {
  return readTabRunIds().includes(runId);
}

function readTabRunIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(TAB_RUNS_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/** Runs a browser tool in this tab and returns the result for Halo. */
export async function runBrowserTool(params: {
  projectId: string;
  utils: ReturnType<typeof api.useUtils>;
  call: OpenBrowserToolCall;
}): Promise<unknown> {
  const { projectId, utils, call } = params;
  const callArgs = safeJsonParse(call.arguments);
  // Loaded on use, so the skill editor stays out of every page's bundle.
  const drafts = await import("@/src/features/skills/utils/haloSkillDraft");

  if (call.toolName === IN_APP_AGENT_EDIT_SKILL_DRAFT_TOOL_NAME) {
    const args = InAppAgentEditSkillDraftArgsSchema.safeParse(callArgs);
    if (!args.success) {
      return invalidArgs();
    }
    const edit = await drafts.editSkillDraftForHalo(
      {
        projectId,
        // A miss is reported to Halo, so its 404 stays quiet.
        findLatestVersion: (name) =>
          utils.skills.byName
            .fetch(
              { projectId, name, label: "latest" },
              { meta: { silentHttpCodes: [404] }, retry: false },
            )
            .catch(() => null),
      },
      args.data,
    );
    if (edit.href) {
      await Router.push(edit.href);
      edit.reload?.();
    }
    return edit.draft;
  }

  if (call.toolName === IN_APP_AGENT_READ_SKILL_DRAFT_TOOL_NAME) {
    const args = InAppAgentReadSkillDraftArgsSchema.safeParse(callArgs);
    if (!args.success) {
      return invalidArgs();
    }
    return drafts.readSkillDraftForHalo({ projectId }, args.data);
  }

  const args = InAppAgentCreateSkillFromDraftArgsSchema.safeParse(callArgs);
  if (!args.success) {
    return invalidArgs();
  }
  const outcome = await drafts.saveSkillDraftForHalo(
    {
      projectId,
      createVersion: (input) => utils.client.skills.createVersion.mutate(input),
    },
    args.data,
  );
  if (outcome.status === "created") {
    await utils.skills.invalidate();
    await Router.push(
      `/project/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(outcome.name)}?version=${outcome.version}`,
    );
  }
  return outcome;
}

function invalidArgs() {
  return { status: "error", message: "Invalid tool arguments." };
}
