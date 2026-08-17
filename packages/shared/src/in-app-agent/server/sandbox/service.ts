import type {
  InAppAgentSandbox,
  InAppAgentSandboxSessionReplacementReason,
  SandboxFile,
  SandboxProvider,
} from "./types";
import { logger, recordIncrement } from "../../../server";

export async function createInAppAgentSandbox(params: {
  conversationId: string;
  projectId: string;
  runId?: string;
  providerSessionId?: string | null;
  provider: SandboxProvider;
  getToolCallFiles: () => Promise<ReadonlyArray<SandboxFile>>;
  saveState: (state: { providerSessionId?: string | null }) => Promise<void>;
}): Promise<{
  sandbox: InAppAgentSandbox;
  onTurnEnded: () => Promise<void>;
  /**
   * True when a workspace persisted by an earlier turn is already gone, so this
   * turn starts from a clean one. Callers pass this to `createAgUiStream` as
   * `sandboxWorkspaceWasReset` so the system prompt can say so.
   */
  workspaceWasReset: boolean;
}> {
  let sessionId = params.providerSessionId ?? null;
  let sessionIsKnownActive = sessionId !== null;

  const recordSessionReplaced = (
    reason: InAppAgentSandboxSessionReplacementReason,
  ) => {
    logger.info("In-app agent sandbox session replaced", {
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.runId,
      provider: params.provider.type,
      reason,
    });
    recordIncrement("langfuse.in_app_agent.sandbox.session_replaced", 1, {
      provider: params.provider.type,
      reason,
    });
  };

  // Probe before the agent runs. `ensureSession` also detects a lost session, but
  // only on the first sandbox tool call, which is after the model has its input.
  // Marking the session inactive here lets `ensureSession` create fresh without
  // paying for a second probe, so this path owns the metric for that case.
  let workspaceWasReset = false;
  if (sessionId && params.provider.probeSession) {
    const lostReason = await params.provider.probeSession({ sessionId });
    if (lostReason) {
      workspaceWasReset = true;
      sessionIsKnownActive = false;
      recordSessionReplaced(lostReason);
    }
  }

  const persistState = async () => {
    await params.saveState({
      providerSessionId: sessionId,
    });
  };

  const updateSessionState = async (nextSessionId: string) => {
    if (nextSessionId === sessionId) {
      sessionIsKnownActive = true;
      return;
    }

    sessionId = nextSessionId;
    await persistState();
    sessionIsKnownActive = true;
  };

  const ensureSession = async () => {
    const session = await params.provider.ensureSession({
      conversationId: params.conversationId,
      sessionId: sessionIsKnownActive ? sessionId : null,
    });

    if (session.replacementReason) {
      recordSessionReplaced(session.replacementReason);
    }

    await updateSessionState(session.sessionId);

    await session.sandbox.syncReadonlyFiles({
      files: await params.getToolCallFiles(),
    });

    return session.sandbox;
  };

  const createExecutionSandbox = (): InAppAgentSandbox => ({
    read: async ({ path }) => (await ensureSession()).read({ path }),
    write: async ({ path, content }) =>
      (await ensureSession()).write({
        path,
        content,
      }),
    edit: async ({ path, oldText, newText }) =>
      (await ensureSession()).edit({
        path,
        oldText,
        newText,
      }),
    bash: async ({ command, timeoutMs }) =>
      (await ensureSession()).bash({
        command,
        timeoutMs,
      }),
  });

  return {
    sandbox: createExecutionSandbox(),
    workspaceWasReset,
    onTurnEnded: async () => {
      if (!sessionId) {
        return;
      }

      await persistState();
    },
  };
}
