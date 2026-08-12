import type { InAppAgentSandbox, SandboxFile, SandboxProvider } from "./types";

export async function terminateInAppAgentSandboxSession(params: {
  provider: Pick<SandboxProvider, "terminateSession">;
  providerSessionId?: string | null;
}): Promise<void> {
  if (!params.providerSessionId) {
    return;
  }

  await params.provider.terminateSession?.({
    sessionId: params.providerSessionId,
  });
}

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
}> {
  let sessionId = params.providerSessionId ?? null;
  let sessionIsKnownActive = sessionId !== null;
  let sessionIsSuspended = false;
  let sessionSuspendPromise: Promise<void> | undefined;

  const persistState = async () => {
    await params.saveState({
      providerSessionId: sessionId,
    });
  };

  const updateSessionState = async (nextSessionId: string) => {
    if (nextSessionId === sessionId) {
      sessionIsKnownActive = true;
      sessionIsSuspended = false;
      return;
    }

    sessionId = nextSessionId;
    await persistState();
    sessionIsKnownActive = true;
    sessionIsSuspended = false;
  };

  const ensureSession = async () => {
    const session = await params.provider.ensureSession({
      conversationId: params.conversationId,
      sessionId: sessionIsKnownActive ? sessionId : null,
    });

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
    onTurnEnded: async () => {
      if (!sessionId || sessionIsSuspended) {
        return;
      }

      if (!sessionSuspendPromise) {
        const sessionIdToSuspend = sessionId;
        sessionSuspendPromise = (async () => {
          await params.provider.suspendSession?.({
            sessionId: sessionIdToSuspend,
          });
          await persistState();
          sessionIsSuspended = true;
        })();
      }

      try {
        await sessionSuspendPromise;
      } finally {
        sessionSuspendPromise = undefined;
      }
    },
  };
}
