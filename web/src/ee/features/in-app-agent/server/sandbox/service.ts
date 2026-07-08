import { getInAppAgentSandboxSnapshotKey } from "@langfuse/shared/src/server";

import type { InAppAgentSandbox, SandboxFile, SandboxProvider } from "./types";

export async function createInAppAgentSandbox(params: {
  conversationId: string;
  projectId: string;
  providerSessionId?: string | null;
  sandboxExpiresAt?: Date | null;
  sandboxProvider?: string | null;
  sandboxSnapshotKey?: string | null;
  ttlMs: number;
  provider: SandboxProvider;
  getToolCallFiles: () => Promise<ReadonlyArray<SandboxFile>>;
  saveState: (state: {
    providerSessionId?: string | null;
    sandboxExpiresAt?: Date | null;
    sandboxProvider?: string | null;
    sandboxSnapshotKey?: string | null;
  }) => Promise<void>;
  now?: () => Date;
}): Promise<{
  sandbox: InAppAgentSandbox;
  onTurnEnded: () => Promise<void>;
}> {
  const providerType = params.provider.type;
  const now = params.now ?? (() => new Date());
  const snapshotKey =
    params.sandboxSnapshotKey ??
    getInAppAgentSandboxSnapshotKey(params.projectId, params.conversationId);
  let sandboxProvider = params.sandboxProvider ?? null;
  let persistedSnapshotKey = params.sandboxSnapshotKey ?? null;
  let sessionId =
    params.sandboxProvider === providerType
      ? (params.providerSessionId ?? null)
      : null;
  let sandboxExpiresAt = params.sandboxExpiresAt ?? null;
  let sessionIsKnownActive =
    sessionId !== null &&
    params.sandboxProvider === providerType &&
    (sandboxExpiresAt === null || sandboxExpiresAt.getTime() > now().getTime());

  const persistState = async () => {
    await params.saveState({
      providerSessionId: sessionId,
      sandboxExpiresAt,
      sandboxProvider: providerType,
      sandboxSnapshotKey: snapshotKey,
    });
    sandboxProvider = providerType;
    persistedSnapshotKey = snapshotKey;
  };

  const updateSessionState = async (nextSessionId: string) => {
    if (
      nextSessionId === sessionId &&
      sandboxProvider === providerType &&
      persistedSnapshotKey === snapshotKey &&
      sandboxExpiresAt === null
    ) {
      sessionIsKnownActive = true;
      return;
    }

    sessionId = nextSessionId;
    sandboxExpiresAt = null;
    await persistState();
    sessionIsKnownActive = true;
  };

  const maybeSuspendExpiredSession = async () => {
    if (
      sessionId !== null &&
      params.provider.suspendSession &&
      sandboxProvider === providerType &&
      sandboxExpiresAt !== null &&
      sandboxExpiresAt.getTime() <= now().getTime()
    ) {
      await params.provider.suspendSession({
        sessionId,
        snapshotKey,
      });
      sessionId = null;
      sandboxExpiresAt = null;
      sessionIsKnownActive = false;
      await persistState();
    }
  };

  const ensureSession = async () => {
    await maybeSuspendExpiredSession();

    const session = await params.provider.ensureSession({
      conversationId: params.conversationId,
      sessionId: sessionIsKnownActive ? sessionId : null,
      snapshotKey,
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
      if (!sessionId) {
        return;
      }

      sandboxExpiresAt = new Date(now().getTime() + params.ttlMs);
      await persistState();
    },
  };
}
