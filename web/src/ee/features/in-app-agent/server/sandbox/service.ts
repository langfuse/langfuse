import type { SandboxFile } from "@repo/in-app-agent-sandbox-server";
import { getInAppAgentSandboxSnapshotKey } from "@langfuse/shared/src/server";

import type { InAppAgentSandboxProviderType } from "./config";
import type { InAppAgentSandbox, SandboxProvider } from "./types";

export async function createInAppAgentSandbox(params: {
  conversationId: string;
  projectId: string;
  providerSessionId?: string | null;
  sandboxExpiresAt?: Date | null;
  sandboxProvider?: string | null;
  sandboxSnapshotKey?: string | null;
  ttlMs: number;
  providerType: InAppAgentSandboxProviderType;
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
    params.sandboxProvider === params.providerType
      ? (params.providerSessionId ?? null)
      : null;
  let sandboxExpiresAt = params.sandboxExpiresAt ?? null;
  let sessionIsKnownActive =
    sessionId !== null &&
    params.sandboxProvider === params.providerType &&
    (sandboxExpiresAt === null || sandboxExpiresAt.getTime() > now().getTime());

  const persistState = async () => {
    await params.saveState({
      providerSessionId: sessionId,
      sandboxExpiresAt,
      sandboxProvider: params.providerType,
      sandboxSnapshotKey: snapshotKey,
    });
    sandboxProvider = params.providerType;
    persistedSnapshotKey = snapshotKey;
  };

  const ensureSession = async () => {
    if (
      sessionId !== null &&
      params.provider.suspendSession &&
      sandboxProvider === params.providerType &&
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

    const session = await params.provider.ensureSession({
      conversationId: params.conversationId,
      sessionId: sessionIsKnownActive ? sessionId : null,
      snapshotKey,
    });

    if (
      session.sessionId !== sessionId ||
      sandboxProvider !== params.providerType ||
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
      if (!sessionId) {
        return;
      }

      sandboxExpiresAt = new Date(now().getTime() + params.ttlMs);
      await persistState();
    },
  };
}
