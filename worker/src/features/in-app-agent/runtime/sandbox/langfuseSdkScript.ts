import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { redactLangfuseSecretKeys } from "@langfuse/shared/src/server/auth/apiKeys";
import {
  InAppAgentSandboxBashResultSchema,
  InAppAgentSandboxReadResultSchema,
} from "@langfuse/shared/in-app-agent";
import {
  DEFAULT_SANDBOX_SDK_SCOPE,
  SANDBOX_KEY_MAX_TTL_MS,
  mintUserBoundSandboxKey,
  revokeSandboxKey,
} from "@langfuse/shared/in-app-agent/server/sandboxKey";
import type { ProjectAction } from "@langfuse/shared/rbac";
import type {
  InAppAgentSandbox,
  SandboxBashParams,
  SandboxFile,
} from "./types";

const DEFAULT_BASH_TIMEOUT_MS = 120_000;
const KEY_EXPIRY_BUFFER_MS = 30_000;
const MAX_SCANNED_SCRIPT_FILES = 5;

const LANGFUSE_SDK_IMPORT_PATTERNS = [
  /^\s*(?:from\s+langfuse\b|import\s+langfuse\b)/m,
  /\bfrom\s+["']@?langfuse(?:\/[\w-]+)?["']/,
  /\b(?:require|import)\(\s*["']@?langfuse(?:\/[\w-]+)?["']\s*\)/,
];
const SCRIPT_PATH_PATTERN = /[\w./-]+\.(?:py|js|mjs|cjs|ts|mts)\b/g;

type SdkScriptContext = {
  projectId: string;
  userId: string;
  conversationId: string;
  /** NEXTAUTH_URL: the one host the guest may reach. */
  langfuseBaseUrl: string | undefined;
  /** Aborts when the run is cancelled, fenced, or the worker shuts down. */
  signal: AbortSignal;
};

type SandboxBashResult = ReturnType<
  typeof InAppAgentSandboxBashResultSchema.parse
>;

type LangfuseSdkScriptApprovalRequest = {
  projectId: string;
  userId: string;
  conversationId: string;
  command: string;
  scriptFiles: SandboxFile[];
  requestedScope: readonly ProjectAction[];
};

type LangfuseSdkScriptApproval =
  | { approved: true; scope: readonly ProjectAction[] }
  | { approved: false; reason: string };

/**
 * Wraps the sandbox so every bash call that runs Langfuse SDK code goes
 * through the approval gate. Other commands run unchanged and without a key.
 *
 * Detection only decides when to ask. The boundary is that a key exists only
 * after approval: an SDK script that slips past detection runs with no
 * credentials.
 */
export function withLangfuseSdkScriptGate(
  sandbox: InAppAgentSandbox,
  ctx: SdkScriptContext,
): InAppAgentSandbox {
  return {
    ...sandbox,
    bash: async (params) => {
      const scriptFiles = await findLangfuseSdkUsage(sandbox, params.command);
      if (!scriptFiles) {
        return sandbox.bash(params);
      }

      const approval = await approveLangfuseSdkScript({
        projectId: ctx.projectId,
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        command: params.command,
        scriptFiles,
        requestedScope: DEFAULT_SANDBOX_SDK_SCOPE,
      });
      if (!approval.approved) {
        return {
          stdout: "",
          stderr: `Langfuse SDK script not run: ${approval.reason}`,
          exitCode: 1,
        } satisfies SandboxBashResult;
      }

      return runApprovedLangfuseSdkScript({
        sandbox,
        ctx,
        params,
        scope: approval.scope,
      });
    },
  };
}

/**
 * "Approve Langfuse SDK script" gate. One approval covers the whole script,
 * however many writes it performs.
 *
 * Intended flow (not built in this change):
 * 1. Summarize: a model-written summary of what the script reads, creates,
 *    and changes, plus `requestedScope`. The code stays collapsed behind a
 *    disclosure.
 * 2. Ask: persist an approval interrupt the same way manual MCP tool approval
 *    does, and end the turn. No key exists while the user decides.
 * 3. Decide: the user approves, optionally narrowing the scope to a subset of
 *    `requestedScope`, or rejects.
 * 4. Resume: the continuation run re-checks the user's access, then calls
 *    `runApprovedLangfuseSdkScript` with the approved scope. Only then is the
 *    key minted.
 *
 * Until that UX exists the gate denies every script, so no sandbox key is
 * minted in a deployed build.
 */
async function approveLangfuseSdkScript(
  request: LangfuseSdkScriptApprovalRequest,
): Promise<LangfuseSdkScriptApproval> {
  logger.info("In-app agent sandbox SDK script awaiting approval", {
    projectId: request.projectId,
    conversationId: request.conversationId,
    scriptFileCount: request.scriptFiles.length,
    requestedScope: request.requestedScope,
  });

  return {
    approved: false,
    reason: "approving Langfuse SDK scripts is not available yet.",
  };
}

/**
 * Runs one approved script with a fresh key: mint, pass it as process env
 * (never in the command string), revoke when the script completes, fails, or
 * the run is cancelled.
 */
async function runApprovedLangfuseSdkScript(params: {
  sandbox: InAppAgentSandbox;
  ctx: SdkScriptContext;
  params: SandboxBashParams;
  scope: readonly ProjectAction[];
}): Promise<SandboxBashResult> {
  const { sandbox, ctx } = params;
  if (!ctx.langfuseBaseUrl) {
    throw new Error("NEXTAUTH_URL must be set to run Langfuse SDK scripts");
  }
  const baseUrl = normalizeBaseUrl(ctx.langfuseBaseUrl);
  const timeoutMs = params.params.timeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;
  const ttlMs = Math.min(
    timeoutMs + KEY_EXPIRY_BUFFER_MS,
    SANDBOX_KEY_MAX_TTL_MS,
  );

  const key = await mintUserBoundSandboxKey(prisma, {
    userId: ctx.userId,
    projectId: ctx.projectId,
    scope: params.scope,
    expiresAt: new Date(Date.now() + ttlMs),
  });

  try {
    const result = InAppAgentSandboxBashResultSchema.parse(
      await rejectOnAbort(
        sandbox.bash({
          command: params.params.command,
          timeoutMs,
          env: {
            LANGFUSE_PUBLIC_KEY: key.publicKey,
            LANGFUSE_SECRET_KEY: key.secretKey,
            LANGFUSE_HOST: baseUrl,
            LANGFUSE_BASE_URL: baseUrl,
            LANGFUSE_SANDBOX_COMPLETION_URL: `${baseUrl}/api/internal/sandbox/llm-completion`,
          },
        }),
        ctx.signal,
      ),
    );

    // Best effort: the guest can still encode the key before printing it.
    return {
      ...result,
      stdout: redactLangfuseSecretKeys(result.stdout),
      stderr: redactLangfuseSecretKeys(result.stderr),
    };
  } finally {
    // Runs on success, failure, and abort. An aborted guest process may still
    // be running; once the row is gone its key is rejected.
    await revokeSandboxKey({
      prisma,
      redis,
      projectId: ctx.projectId,
      apiKeyId: key.id,
    }).catch((error: unknown) => {
      logger.error("Failed to revoke in-app agent sandbox key", {
        error,
        projectId: ctx.projectId,
        apiKeyId: key.id,
      });
      throw error;
    });
  }
}

/** Returns the scanned script files when the command uses the Langfuse SDK, else null. */
async function findLangfuseSdkUsage(
  sandbox: InAppAgentSandbox,
  command: string,
): Promise<SandboxFile[] | null> {
  const usesSdk = (text: string) =>
    LANGFUSE_SDK_IMPORT_PATTERNS.some((pattern) => pattern.test(text));

  const paths = [...new Set(command.match(SCRIPT_PATH_PATTERN) ?? [])].slice(
    0,
    MAX_SCANNED_SCRIPT_FILES,
  );
  const files: SandboxFile[] = [];
  for (const path of paths) {
    const file = InAppAgentSandboxReadResultSchema.safeParse(
      await sandbox.read({ path }).catch(() => null),
    );
    if (file.success && file.data.content !== null) {
      files.push({ path: file.data.path, content: file.data.content });
    }
  }

  return usesSdk(command) || files.some((file) => usesSdk(file.content))
    ? files
    : null;
}

async function rejectOnAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  // The command may still fail after an abort has already won the race.
  promise.catch(() => undefined);
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("In-app agent run aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/api\/auth\/?$/, "").replace(/\/$/, "");
}
