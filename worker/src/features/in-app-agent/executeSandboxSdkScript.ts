import { randomUUID } from "crypto";

import { InAppAgentSandboxBashResultSchema } from "@langfuse/shared/in-app-agent";
import {
  logger,
  mintSandboxExecutionKey,
  revokeSandboxExecutionKey,
  sandboxProcessEnv,
} from "@langfuse/shared/src/server";

import { env } from "../../env";
import {
  createInAppAgentSandboxProvider,
  getDefaultInAppAgentSandboxProviderType,
} from "./runtime/sandbox/config";
import type { SandboxProvider } from "./runtime/sandbox/types";

export class SandboxScriptCancelledError extends Error {
  constructor() {
    super("Sandbox script execution was cancelled");
    this.name = "SandboxScriptCancelledError";
  }
}

/**
 * Runs one guest command with a short-lived project API key in the process
 * environment. The key is revoked when the command returns, throws, or the
 * caller aborts. Expiry is only a backstop.
 */
export async function executeSandboxSdkScript(params: {
  projectId: string;
  userId: string;
  approvedActions: readonly string[];
  command: string;
  timeoutMs: number;
  signal?: AbortSignal;
}) {
  const providerType = getDefaultInAppAgentSandboxProviderType();
  if (!providerType) {
    throw new Error("No in-app agent sandbox provider is configured");
  }
  const origin = env.NEXTAUTH_URL;
  if (!origin) {
    throw new Error("NEXTAUTH_URL is required to run a sandbox script");
  }

  const key = await mintSandboxExecutionKey({
    projectId: params.projectId,
    userId: params.userId,
    approvedActions: params.approvedActions,
    expiresAt: new Date(Date.now() + params.timeoutMs),
  });

  let provider: SandboxProvider | undefined;
  let sessionId: string | undefined;
  let failure: unknown;
  let result:
    | ReturnType<typeof InAppAgentSandboxBashResultSchema.parse>
    | undefined;

  try {
    if (params.signal?.aborted) {
      throw new SandboxScriptCancelledError();
    }
    if (params.command.includes(key.secretKey)) {
      throw new Error("Sandbox command must not contain the execution secret");
    }

    provider = await createInAppAgentSandboxProvider(providerType);
    const session = await provider.ensureSession({
      conversationId: `sandbox-sdk-${randomUUID()}`,
      sessionId: null,
    });
    sessionId = session.sessionId;

    const bashPromise = session.sandbox.bash({
      command: params.command,
      timeoutMs: params.timeoutMs,
      env: sandboxProcessEnv({
        publicKey: key.publicKey,
        secretKey: key.secretKey,
        langfuseOrigin: origin,
      }),
    });
    const rawResult = await new Promise<unknown>((resolve, reject) => {
      bashPromise.then(resolve, reject);
      if (!params.signal) return;
      const onAbort = () => reject(new SandboxScriptCancelledError());
      if (params.signal.aborted) {
        onAbort();
        return;
      }
      params.signal.addEventListener("abort", onAbort, { once: true });
    });

    result = InAppAgentSandboxBashResultSchema.parse(rawResult);
  } catch (error) {
    failure = error;
  }

  let revokeError: unknown;
  try {
    await revokeSandboxExecutionKey({
      id: key.id,
      projectId: params.projectId,
    });
  } catch (error) {
    revokeError = error;
    logger.error("Failed to revoke sandbox execution key", {
      apiKeyId: key.id,
      projectId: params.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (provider?.terminateSession && sessionId) {
    await Promise.resolve(provider.terminateSession({ sessionId })).catch(
      (error: unknown) => {
        logger.error("Failed to terminate sandbox session", {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
  }

  if (revokeError) {
    if (failure) {
      logger.error(
        "Sandbox script failed and its execution key was not revoked",
        {
          apiKeyId: key.id,
          projectId: params.projectId,
          error: failure instanceof Error ? failure.message : String(failure),
        },
      );
    }
    throw revokeError instanceof Error
      ? revokeError
      : new Error("Failed to revoke sandbox execution key");
  }
  if (failure) throw failure;
  if (!result) {
    throw new Error("Sandbox script produced no result");
  }
  return result;
}
