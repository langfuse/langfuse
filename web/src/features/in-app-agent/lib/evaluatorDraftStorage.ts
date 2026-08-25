import {
  InAppAgentLlmEvaluatorDraftSchema,
  type InAppAgentLlmEvaluatorDraft,
} from "@langfuse/shared/in-app-agent";

const STORAGE_KEY_PREFIX = "langfuse:in-app-agent-evaluator-draft";

let pendingDraftByProjectId = new Map<string, InAppAgentLlmEvaluatorDraft>();

function getStorageKey(projectId: string) {
  return `${STORAGE_KEY_PREFIX}:${projectId}`;
}

export function writeAgentEvaluatorDraft(
  projectId: string,
  draft: InAppAgentLlmEvaluatorDraft,
) {
  pendingDraftByProjectId.set(projectId, draft);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getStorageKey(projectId),
      JSON.stringify(draft),
    );
  } catch {
    // Session storage can throw in private mode; the in-memory copy still works
    // for same-tab navigation from the assistant button.
  }
}

export function clearAgentEvaluatorDraft(projectId: string) {
  pendingDraftByProjectId.delete(projectId);

  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(getStorageKey(projectId));
  } catch {
    // Ignore quota / private-mode failures; in-memory state is already cleared.
  }
}

/** Drops the in-memory copy so a later read exercises sessionStorage. */
export function forgetPendingAgentEvaluatorDraft(projectId: string) {
  pendingDraftByProjectId.delete(projectId);
}

export function readAgentEvaluatorDraft(
  projectId: string,
): InAppAgentLlmEvaluatorDraft | null {
  const pending = pendingDraftByProjectId.get(projectId);
  if (pending) {
    return pending;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(getStorageKey(projectId));
    if (!stored) {
      return null;
    }

    const parsed = InAppAgentLlmEvaluatorDraftSchema.safeParse(
      JSON.parse(stored),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
