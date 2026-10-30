import { createHash, randomUUID } from "crypto";
import { ForbiddenError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { redactLangfuseSecretKeys } from "@langfuse/shared/src/server/auth/apiKeys";
import {
  InAppAgentSandboxBashResultSchema,
  InAppAgentSandboxReadResultSchema,
} from "@langfuse/shared/in-app-agent";
import {
  SANDBOX_KEY_MAX_TTL_MS,
  mintUserBoundSandboxKey,
  revokeSandboxKey,
  type SandboxKey,
} from "@langfuse/shared/in-app-agent/server/sandboxKey";
import type {
  InAppAgentSandbox,
  SandboxBashParams,
  SandboxFile,
} from "./types";

const DEFAULT_BASH_TIMEOUT_MS = 120_000;
const KEY_EXPIRY_BUFFER_MS = 30_000;
const MAX_SCANNED_SCRIPT_FILES = 5;
const CANCEL_TIMEOUT_MS = 5_000;

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
  /** What the user approves; the script runs only while it still matches. */
  scriptHash: string;
};

type LangfuseSdkScriptApproval =
  | { approved: true; scriptHash: string }
  | { approved: false; reason: string };

/**
 * Wraps the sandbox so every bash call that runs Langfuse SDK code goes
 * through the approval gate. Other commands run unchanged and without a key.
 *
 * Detection decides when to ask. A key is minted only after approval, so any
 * other command runs without Langfuse credentials.
 *
 * Every operation through the returned sandbox is serialized, so the agent's
 * own tool calls cannot change a script between its hash check and its run.
 */
export function withLangfuseSdkScriptGate(
  sandbox: InAppAgentSandbox,
  ctx: SdkScriptContext,
): InAppAgentSandbox {
  const exclusive = createExclusiveRunner();
  return {
    ...sandbox,
    read: (params) => exclusive(() => sandbox.read(params)),
    write: (params) => exclusive(() => sandbox.write(params)),
    edit: (params) => exclusive(() => sandbox.edit(params)),
    bash: (params) =>
      exclusive(async () => {
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
          scriptHash: hashScript(params.command, scriptFiles),
        });
        if (!approval.approved) {
          return notRun(approval.reason);
        }

        return runApprovedLangfuseSdkScript({
          sandbox,
          ctx,
          params,
          scriptFiles,
          scriptHash: approval.scriptHash,
        });
      }),
  };
}

/**
 * "Approve Langfuse SDK script" gate. One approval covers the whole script,
 * however many writes it performs.
 *
 * Intended flow (not built in this change):
 * 1. Summarize: a model-written summary of what the script reads, creates,
 *    and changes. The code stays collapsed behind a disclosure.
 * 2. Ask: persist an approval interrupt the same way manual MCP tool approval
 *    does, and end the turn. No key exists while the user decides.
 * 3. Decide: the user approves or rejects `scriptHash`.
 * 4. Resume: the continuation run calls `runApprovedLangfuseSdkScript` with
 *    the approved hash. Only then is the key minted, with the user's access
 *    resolved at that moment.
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
    scriptHash: request.scriptHash,
  });

  return {
    approved: false,
    reason: "approving Langfuse SDK scripts is not available yet.",
  };
}

/**
 * Runs one approved script with a fresh key: kill leftover guest processes,
 * re-check the approved hash, mint, pass the key as process env (never in the
 * command string), and revoke when the script completes, fails, or the run is
 * cancelled. Callers hold the gate's exclusive runner.
 */
async function runApprovedLangfuseSdkScript(params: {
  sandbox: InAppAgentSandbox;
  ctx: SdkScriptContext;
  params: SandboxBashParams;
  scriptFiles: SandboxFile[];
  scriptHash: string;
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

  // Nothing started earlier may outlive into the window where a key exists.
  const reaped = await reapGuest(sandbox, ctx);
  if (!reaped) {
    return notRun("leftover sandbox processes could not be stopped.");
  }

  const currentFiles = await readScriptFiles(
    sandbox,
    params.scriptFiles.map((file) => file.path),
  );
  if (
    currentFiles.length !== params.scriptFiles.length ||
    hashScript(params.params.command, currentFiles) !== params.scriptHash
  ) {
    return notRun("the script changed after it was approved.");
  }

  let key: SandboxKey;
  try {
    key = await mintUserBoundSandboxKey(prisma, {
      userId: ctx.userId,
      projectId: ctx.projectId,
      expiresAt: new Date(Date.now() + ttlMs),
    });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return notRun("you no longer have access to this project.");
    }
    throw error;
  }

  const commandId = randomUUID();
  try {
    const result = InAppAgentSandboxBashResultSchema.parse(
      await rejectOnAbort(
        sandbox.bash({
          command: params.params.command,
          timeoutMs,
          commandId,
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

    // Keys that appear in the output are masked.
    return {
      ...result,
      stdout: redactLangfuseSecretKeys(result.stdout),
      stderr: redactLangfuseSecretKeys(result.stderr),
    };
  } finally {
    // Runs on success, failure, and abort. Revocation is the control; the
    // guest cleanup runs in parallel so revocation never waits on the guest.
    await Promise.all([
      revokeSandboxKey({
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
      }),
      (async () => {
        if (ctx.signal.aborted) {
          await cancelGuestCommand(sandbox, commandId, ctx);
        }
        await reapGuest(sandbox, ctx);
      })(),
    ]);
  }
}

/** Kills every guest process but the server; false when any survive or reaping is unavailable. */
async function reapGuest(
  sandbox: InAppAgentSandbox,
  ctx: SdkScriptContext,
): Promise<boolean> {
  try {
    const result = await sandbox.reap?.();
    if (result?.survivors === 0) return true;
    logger.warn("In-app agent sandbox processes survived reaping", {
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
      survivors: result?.survivors ?? null,
    });
  } catch (error) {
    logger.warn("Failed to reap in-app agent sandbox processes", {
      error,
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
    });
  }
  return false;
}

/** sha256 over the command and each scanned file, in path order. */
function hashScript(command: string, files: SandboxFile[]): string {
  const sorted = files.toSorted((a, b) => a.path.localeCompare(b.path));
  return createHash("sha256")
    .update(
      JSON.stringify({
        command,
        files: sorted.map((file) => [file.path, file.content]),
      }),
    )
    .digest("hex");
}

function createExclusiveRunner() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

/** Kills the command's process group; the reap that follows covers the rest. */
async function cancelGuestCommand(
  sandbox: InAppAgentSandbox,
  commandId: string,
  ctx: SdkScriptContext,
) {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      sandbox.cancelBash?.({ commandId }),
      new Promise((resolve) => {
        timeoutId = setTimeout(resolve, CANCEL_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    logger.warn("Failed to cancel in-app agent sandbox SDK script", {
      error,
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function notRun(reason: string): SandboxBashResult {
  return {
    stdout: "",
    stderr: `Langfuse SDK script not run: ${reason}`,
    exitCode: 1,
  };
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
  const files = await readScriptFiles(sandbox, paths);

  return usesSdk(command) || files.some((file) => usesSdk(file.content))
    ? files
    : null;
}

/** Reads the files that exist among `paths`; missing or unreadable ones are skipped. */
async function readScriptFiles(
  sandbox: InAppAgentSandbox,
  paths: string[],
): Promise<SandboxFile[]> {
  const files: SandboxFile[] = [];
  for (const path of paths) {
    const file = InAppAgentSandboxReadResultSchema.safeParse(
      await sandbox.read({ path }).catch(() => null),
    );
    if (file.success && file.data.content !== null) {
      files.push({ path: file.data.path, content: file.data.content });
    }
  }
  return files;
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
