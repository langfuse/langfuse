import type {
  InAppAgentSandbox,
  InAppAgentSandboxSessionReplacementReason,
  SandboxFile,
  SandboxProvider,
} from "./types";
import {
  InAppAgentSandboxBashResultSchema,
  InAppAgentSandboxEditResultSchema,
  InAppAgentSandboxReadResultSchema,
  InAppAgentSandboxWriteResultSchema,
} from "@langfuse/shared/in-app-agent";
import { logger, recordIncrement } from "@langfuse/shared/src/server";

export async function createInAppAgentSandbox(params: {
  conversationId: string;
  projectId: string;
  providerSessionId?: string | null;
  provider: SandboxProvider;
  getToolCallFiles: () => Promise<ReadonlyArray<SandboxFile>>;
  saveState: (state: { providerSessionId?: string | null }) => Promise<void>;
}): Promise<{
  sandbox: InAppAgentSandbox;
  onTurnEnded: () => Promise<void>;
  /** The earlier turn's workspace is gone; pass on as `sandboxWorkspaceWasReset`. */
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
      reason,
    });
    recordIncrement("langfuse.in_app_agent.sandbox.session_replaced", 1, {
      reason,
    });
  };

  // Probe up front: `ensureSession` only notices a lost session on the first tool
  // call, too late to tell the model. Clearing the flag avoids a second probe.
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
    read: async ({ path }) =>
      InAppAgentSandboxReadResultSchema.parse(
        await (await ensureSession()).read({ path }),
      ),
    write: async ({ path, content }) =>
      InAppAgentSandboxWriteResultSchema.parse(
        await (
          await ensureSession()
        ).write({
          path,
          content,
        }),
      ),
    edit: async ({ path, oldText, newText }) =>
      InAppAgentSandboxEditResultSchema.parse(
        await (
          await ensureSession()
        ).edit({
          path,
          oldText,
          newText,
        }),
      ),
    bash: async ({ command, timeoutMs }) =>
      InAppAgentSandboxBashResultSchema.parse(
        await (
          await ensureSession()
        ).bash({
          command,
          timeoutMs,
        }),
      ),
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
