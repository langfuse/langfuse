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
}): Promise<InAppAgentSandbox> {
  const now = params.now ?? (() => new Date());
  const snapshotKey =
    params.sandboxSnapshotKey ??
    getInAppAgentSandboxSnapshotKey(params.projectId, params.conversationId);
  let sandboxProvider = params.sandboxProvider ?? null;
  let persistedSnapshotKey = params.sandboxSnapshotKey ?? null;
  let sessionId =
    params.sandboxProvider === params.provider.name
      ? params.providerSessionId ?? null
      : null;
  let sandboxExpiresAt = params.sandboxExpiresAt ?? null;
  let sessionIsKnownActive =
    sessionId !== null &&
    params.sandboxProvider === params.provider.name &&
    (sandboxExpiresAt === null || sandboxExpiresAt.getTime() > now().getTime());

  const persistState = async () => {
    await params.saveState({
      providerSessionId: sessionId,
      sandboxExpiresAt,
      sandboxProvider: params.provider.name,
      sandboxSnapshotKey: snapshotKey,
    });
    sandboxProvider = params.provider.name;
    persistedSnapshotKey = snapshotKey;
  };

  const ensureSession = async () => {
    const session = await params.provider.ensureSession({
      sessionId: sessionIsKnownActive ? sessionId : null,
      snapshotKey,
    });

    if (
      session.sessionId !== sessionId ||
      sandboxProvider !== params.provider.name ||
      persistedSnapshotKey !== snapshotKey ||
      (!sessionIsKnownActive && sandboxExpiresAt !== null)
    ) {
      sessionId = session.sessionId;
      sandboxExpiresAt = null;
      await persistState();
    }

    sessionIsKnownActive = true;

    await params.provider.syncReadonlyFiles({
      sessionId: session.sessionId,
      files: await params.getToolCallFiles(),
    });

    return session.sessionId;
  };

  return {
    read: async ({ path }) =>
      params.provider.read({ sessionId: await ensureSession(), path }),
    write: async ({ path, content }) =>
      params.provider.write({
        sessionId: await ensureSession(),
        path,
        content,
      }),
    edit: async ({ path, oldText, newText }) =>
      params.provider.edit({
        sessionId: await ensureSession(),
        path,
        oldText,
        newText,
      }),
    bash: async ({ command, timeoutMs }) =>
      params.provider.bash({
        sessionId: await ensureSession(),
        command,
        timeoutMs,
      }),
    onTurnEnded: async () => {
      if (!sessionId || !params.provider.scheduleSuspension) {
        return;
      }

      sandboxExpiresAt = new Date(now().getTime() + params.ttlMs);
      await params.provider.scheduleSuspension({
        sessionId,
        snapshotKey,
        expiresAt: sandboxExpiresAt,
      });
      await persistState();
    },
  };
}
