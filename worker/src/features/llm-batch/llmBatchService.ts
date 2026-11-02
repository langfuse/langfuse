import { randomUUID } from "crypto";
import { LlmBatchRequestStatus } from "@prisma/client";
import { VertexAIConfigSchema } from "@langfuse/shared";
import {
  isClaudeModel,
  LLMAdapter,
  type LlmBatchProvider,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../../errors/UnrecoverableError";
import { LlmBatchDeferredError } from "./errors";
import type { LlmBatchRow, LlmBatchStore } from "./store";
import {
  createCaptureTransport,
  createReplayTransport,
  type CapturedProviderRequest,
} from "./transport";

/** True when the connection is a Vertex AI connection with a batch config. */
export function hasBatchConfig(params: {
  adapter: string;
  config: unknown;
}): boolean {
  if (params.adapter !== LLMAdapter.VertexAI) return false;
  const config = VertexAIConfigSchema.safeParse(params.config ?? {});
  return config.success && Boolean(config.data.batchGcsUri);
}

/**
 * True when evaluator calls on this connection and model go through provider
 * batch jobs. Vertex AI Gemini models only, for now: Claude on Vertex uses a
 * different batch input format.
 */
export function isBatchInferenceEnabled(params: {
  adapter: string;
  config: unknown;
  model: string;
}): boolean {
  return hasBatchConfig(params) && !isClaudeModel(params.model);
}

/** Runs the evaluator's model call through a given transport. */
export type RunWithTransport = (params: {
  /** Undefined for a normal online call. */
  transport: typeof fetch | undefined;
  /** False while capturing: nothing must be written to the execution trace. */
  traced: boolean;
  /** Extra metadata for the execution trace of the replayed call. */
  metadata?: Record<string, string>;
}) => Promise<unknown>;

const isGeminiGenerateContent = (captured: CapturedProviderRequest) =>
  /\/publishers\/google\/models\/[^/:]+:generateContent(\?|$)/.test(
    captured.url,
  );

/**
 * The batch path of an evaluator's LLM call.
 *
 * First run: builds the request through the AI SDK with a capturing transport,
 * stores it and throws `LlmBatchDeferredError`. Nothing is sent and nothing is
 * traced. After the batch job answered: runs the same call again with a
 * transport that returns the stored response, traced like an online call.
 */
export async function callLLMViaBatch(params: {
  projectId: string;
  jobExecutionId: string;
  llmApiKeyId: string;
  model: string;
  run: RunWithTransport;
  store: LlmBatchStore;
}): Promise<unknown> {
  const { projectId, jobExecutionId, store } = params;
  const existing = await store.find(projectId, jobExecutionId);

  if (!existing) {
    const { transport, getCaptured } = createCaptureTransport();
    try {
      await params.run({ transport, traced: false });
    } catch (e) {
      // The capture transport always throws once it has the request; any
      // error before that is a real one (e.g. invalid media) and propagates.
      if (!getCaptured()) throw e;
    }
    const captured = getCaptured();
    if (!captured) {
      throw new Error("Batch inference: the model call sent no request");
    }
    if (!isGeminiGenerateContent(captured)) {
      throw new UnrecoverableError(
        "Batch inference supports Gemini models on Vertex AI only",
      );
    }
    const row = await store.createPending({
      projectId,
      jobExecutionId,
      llmApiKeyId: params.llmApiKeyId,
      model: params.model,
      request: captured.body,
    });
    throw new LlmBatchDeferredError(row.id, projectId);
  }

  switch (existing.status) {
    case LlmBatchRequestStatus.PENDING:
    case LlmBatchRequestStatus.SUBMITTED:
      throw new LlmBatchDeferredError(existing.id, projectId);
    case LlmBatchRequestStatus.FAILED:
      throw new UnrecoverableError(
        `Batch inference failed: ${existing.error ?? "unknown error"}`,
      );
    case LlmBatchRequestStatus.SUCCEEDED:
      return params.run({
        transport: createReplayTransport(existing.response),
        traced: true,
        metadata: {
          llm_batch_request_id: existing.id,
          ...(existing.providerJobId
            ? { llm_batch_job_id: existing.providerJobId }
            : {}),
        },
      });
  }
}

export type LlmBatchSettings = {
  /** Submit a group once its oldest pending row is this old. */
  flushAfterSeconds: number;
  /** Submit a group at once when it has this many rows; also the job size cap. */
  maxRequestsPerJob: number;
  /** Fail rows without a result after this long. */
  maxAgeSeconds: number;
  /** Delete finished rows after this many days. */
  retentionDays: number;
};

export type LlmBatchTickDeps = {
  store: LlmBatchStore;
  /** Null when the connection is gone or no longer has batch enabled. */
  getProvider: (llmApiKeyId: string) => Promise<LlmBatchProvider | null>;
  /** Re-enqueues the evaluation of a finished row. */
  resume: (row: LlmBatchRow) => Promise<void>;
  settings: LlmBatchSettings;
  now?: () => Date;
  log?: (level: "info" | "warn" | "error", message: string) => void;
};

export type LlmBatchTickResult = {
  submittedJobs: number;
  completed: number;
  failed: number;
  resumed: number;
};

const STALE_CLAIM_MS = 10 * 60 * 1000;
const RESUME_LIMIT = 500;

/**
 * One pass of the batch scheduler: expire old rows, submit due groups, poll
 * open jobs, resume finished evaluations and delete old rows. Safe to run on
 * several workers at once.
 */
export async function runLlmBatchTick(
  deps: LlmBatchTickDeps,
): Promise<LlmBatchTickResult> {
  const { store, settings } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const result: LlmBatchTickResult = {
    submittedJobs: 0,
    completed: 0,
    failed: 0,
    resumed: 0,
  };

  // Providers are resolved once per connection and tick.
  const providers = new Map<string, Promise<LlmBatchProvider | null>>();
  const providerFor = (llmApiKeyId: string) => {
    let provider = providers.get(llmApiKeyId);
    if (!provider) {
      provider = deps.getProvider(llmApiKeyId).catch((e) => {
        log("error", `Batch provider for ${llmApiKeyId} unavailable: ${e}`);
        return null;
      });
      providers.set(llmApiKeyId, provider);
    }
    return provider;
  };
  const failRows = async (rows: LlmBatchRow[], error: string) => {
    await store.fail(
      rows.map((r) => r.id),
      error,
      now(),
    );
    result.failed += rows.length;
  };

  await store.releaseStaleClaims(new Date(now().getTime() - STALE_CLAIM_MS));

  const expired = await store.openRowsCreatedBefore(
    new Date(now().getTime() - settings.maxAgeSeconds * 1000),
  );
  if (expired.length > 0) {
    await failRows(
      expired,
      `No batch result after ${Math.round(settings.maxAgeSeconds / 3600)} h`,
    );
  }

  for (const group of await store.pendingGroups()) {
    const isDue =
      group.count >= settings.maxRequestsPerJob ||
      now().getTime() - group.oldest.getTime() >=
        settings.flushAfterSeconds * 1000;
    if (!isDue) continue;

    const provider = await providerFor(group.llmApiKeyId);
    if (!provider) {
      await failRows(
        await store.openRowsOfConnection(group.llmApiKeyId),
        "The LLM connection was deleted or no longer has batch inference enabled",
      );
      continue;
    }

    const claimId = randomUUID();
    const rows = await store.claimPending({
      llmApiKeyId: group.llmApiKeyId,
      model: group.model,
      limit: settings.maxRequestsPerJob,
      claimId,
    });
    if (rows.length === 0) continue;

    try {
      const stamp = now().toISOString().replace(/[-:.]/g, "").slice(0, 15);
      const providerJobId = await provider.submit({
        model: group.model,
        items: rows.map((r) => ({
          id: r.id,
          request: r.request as Record<string, unknown>,
        })),
        submissionId: `${stamp}-${claimId.slice(0, 8)}`,
      });
      await store.markSubmitted(claimId, providerJobId, now());
      result.submittedJobs += 1;
      log(
        "info",
        `Submitted ${rows.length} ${group.model} requests as ${providerJobId}`,
      );
    } catch (e) {
      // Rows go back to PENDING; the next tick tries again until they expire.
      await store.releaseClaim(claimId);
      log("warn", `Batch submit for ${group.model} failed: ${e}`);
    }
  }

  for (const job of await store.openProviderJobs()) {
    const provider = await providerFor(job.llmApiKeyId);
    if (!provider) {
      await failRows(
        await store.rowsOfProviderJob(job.providerJobId),
        "The LLM connection was deleted or no longer has batch inference enabled",
      );
      continue;
    }
    let poll;
    try {
      poll = await provider.poll(job.providerJobId);
    } catch (e) {
      log("warn", `Polling ${job.providerJobId} failed: ${e}`);
      continue;
    }
    if (poll.state === "running") continue;

    const rows = await store.rowsOfProviderJob(job.providerJobId);
    const missing: LlmBatchRow[] = [];
    for (const row of rows) {
      const item = poll.results.get(row.id);
      if (item?.ok) {
        await store.complete(row.id, item.response, now());
        result.completed += 1;
      } else if (item) {
        await failRows([row], item.error);
      } else {
        missing.push(row);
      }
    }
    if (missing.length > 0) {
      await failRows(
        missing,
        poll.jobError ?? `Batch job ${job.providerJobId} returned no result`,
      );
    }
  }

  for (const row of await store.claimResumable(RESUME_LIMIT, now())) {
    try {
      await deps.resume(row);
      result.resumed += 1;
    } catch (e) {
      await store.unclaimResume(row.id);
      log("warn", `Resuming evaluation for batch row ${row.id} failed: ${e}`);
    }
  }

  await store.deleteFinishedBefore(
    new Date(now().getTime() - settings.retentionDays * 24 * 60 * 60 * 1000),
  );

  return result;
}
