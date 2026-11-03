import { GoogleAuth } from "google-auth-library";
import {
  VertexAIConfigSchema,
  type LLMConnectionConfig,
} from "../../../interfaces/customLLMProviderConfigSchemas";
import {
  assertValidVertexLocation,
  resolveVertexConnection,
} from "../ai-sdk/providers/vertex";
import type {
  LlmBatchItem,
  LlmBatchItemResult,
  LlmBatchPollResult,
  LlmBatchProvider,
} from "./types";

/** Label that carries our row id through a Vertex batch job. */
export const VERTEX_BATCH_ID_LABEL = "langfuse_batch_request_id";

/** Job label that carries the submission id, for `findJob`. */
export const VERTEX_SUBMISSION_ID_LABEL = "langfuse_submission_id";

/** Vertex AI label values: lowercase letters, digits, "-", "_"; max 63. */
const SUBMISSION_ID_PATTERN = /^[a-z0-9_-]{1,63}$/;

const assertValidSubmissionId = (submissionId: string) => {
  if (!SUBMISSION_ID_PATTERN.test(submissionId)) {
    throw new Error(`Invalid batch submission id: ${submissionId}`);
  }
};

const TERMINAL_STATES = new Set([
  "JOB_STATE_SUCCEEDED",
  "JOB_STATE_PARTIALLY_SUCCEEDED",
  "JOB_STATE_FAILED",
  "JOB_STATE_CANCELLED",
  "JOB_STATE_EXPIRED",
]);

/** Authorized HTTP call to Google APIs. Throws on non-2xx. */
export type GoogleApiRequest = (opts: {
  url: string;
  method?: "GET" | "POST";
  /** Raw request body; sent as is. */
  body?: string;
  headers?: Record<string, string>;
  responseType: "json" | "text";
}) => Promise<unknown>;

const parseGcsUri = (uri: string): { bucket: string; prefix: string } => {
  const match = /^gs:\/\/([^/]+)(?:\/(.*))?$/.exec(uri);
  if (!match) throw new Error(`Invalid Cloud Storage URI: ${uri}`);
  return { bucket: match[1], prefix: (match[2] ?? "").replace(/\/+$/, "") };
};

const joinPath = (...parts: string[]) => parts.filter(Boolean).join("/");

const vertexHost = (location: string) =>
  location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;

/**
 * Vertex AI loads batch input through BigQuery, which rejects field names
 * such as "$schema" (Invalid field name "$schema"). The AI SDK adds that key
 * to the JSON Schema of structured output; it carries no meaning for the
 * model, so it is dropped everywhere in the request.
 */
export function stripBatchUnsafeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripBatchUnsafeKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "$schema")
        .map(([key, v]) => [key, stripBatchUnsafeKeys(v)]),
    );
  }
  return value;
}

/**
 * Vertex AI's request for a Gemini model as the AI SDK built it for
 * `generateContent`. Batch input takes the same body; the row id rides along
 * as a request label, which Vertex echoes in the output line.
 */
const toBatchLine = (item: LlmBatchItem): string => {
  const existingLabels =
    item.request.labels && typeof item.request.labels === "object"
      ? (item.request.labels as Record<string, string>)
      : {};
  return JSON.stringify({
    request: {
      ...(stripBatchUnsafeKeys(item.request) as Record<string, unknown>),
      labels: { ...existingLabels, [VERTEX_BATCH_ID_LABEL]: item.id },
    },
  });
};

const hasStatusError = (status: unknown): boolean =>
  typeof status === "string"
    ? status.trim() !== ""
    : status !== null &&
      typeof status === "object" &&
      Object.keys(status).length > 0;

/** Parses Vertex batch output JSONL into results by row id. */
export function parseVertexBatchOutput(
  lines: string[],
): Map<string, LlmBatchItemResult> {
  const results = new Map<string, LlmBatchItemResult>();
  for (const line of lines) {
    if (line.trim() === "") continue;
    let parsed: {
      request?: { labels?: Record<string, string> };
      response?: unknown;
      status?: unknown;
    };
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const id = parsed.request?.labels?.[VERTEX_BATCH_ID_LABEL];
    if (!id) continue;
    if (parsed.response && !hasStatusError(parsed.status)) {
      results.set(id, { ok: true, response: parsed.response });
    } else {
      results.set(id, {
        ok: false,
        error: `Vertex AI batch item failed: ${
          typeof parsed.status === "string"
            ? parsed.status
            : JSON.stringify(parsed.status ?? "no response")
        }`.slice(0, 1000),
      });
    }
  }
  return results;
}

export function createVertexBatchProviderWithRequest(params: {
  project: string;
  location: string;
  gcsUri: string;
  request: GoogleApiRequest;
}): LlmBatchProvider {
  const { project, location, request } = params;
  assertValidVertexLocation(location);
  const { bucket, prefix } = parseGcsUri(params.gcsUri);
  const host = vertexHost(location);

  const readOutputLines = async (outputDirectory: string) => {
    const out = parseGcsUri(outputDirectory);
    const lines: string[] = [];
    let pageToken: string | undefined;
    do {
      const listUrl =
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(out.bucket)}/o` +
        `?prefix=${encodeURIComponent(`${out.prefix}/`)}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
      const page = (await request({ url: listUrl, responseType: "json" })) as {
        items?: { name: string }[];
        nextPageToken?: string;
      };
      for (const item of page.items ?? []) {
        if (!item.name.endsWith(".jsonl")) continue;
        const text = (await request({
          url: `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(out.bucket)}/o/${encodeURIComponent(item.name)}?alt=media`,
          responseType: "text",
        })) as string;
        lines.push(...text.split("\n"));
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return lines;
  };

  return {
    async submit({ model, items, submissionId }) {
      assertValidSubmissionId(submissionId);
      const base = joinPath(prefix, submissionId);
      const inputObject = joinPath(base, "input.jsonl");
      await request({
        url: `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(inputObject)}`,
        method: "POST",
        headers: { "content-type": "application/jsonl" },
        body: items.map(toBatchLine).join("\n") + "\n",
        responseType: "json",
      });

      const job = (await request({
        url: `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${location}/batchPredictionJobs`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: `langfuse-${submissionId}`.slice(0, 128),
          model: `publishers/google/models/${model}`,
          labels: { [VERTEX_SUBMISSION_ID_LABEL]: submissionId },
          inputConfig: {
            instancesFormat: "jsonl",
            gcsSource: { uris: [`gs://${bucket}/${inputObject}`] },
          },
          outputConfig: {
            predictionsFormat: "jsonl",
            gcsDestination: {
              outputUriPrefix: `gs://${bucket}/${joinPath(base, "output")}`,
            },
          },
        }),
        responseType: "json",
      })) as { name?: string };
      if (!job.name) {
        throw new Error("Vertex AI did not return a batch job name");
      }
      return job.name;
    },

    async findJob(submissionId) {
      assertValidSubmissionId(submissionId);
      const filter = `labels.${VERTEX_SUBMISSION_ID_LABEL}="${submissionId}"`;
      const page = (await request({
        url: `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${location}/batchPredictionJobs?filter=${encodeURIComponent(filter)}&pageSize=1`,
        responseType: "json",
      })) as { batchPredictionJobs?: { name?: string }[] };
      return page.batchPredictionJobs?.[0]?.name ?? null;
    },

    async poll(providerJobId): Promise<LlmBatchPollResult> {
      // Job names are projects/<p>/locations/<l>/batchPredictionJobs/<id>.
      if (
        !/^projects\/[^/]+\/locations\/[a-z0-9-]+\/batchPredictionJobs\/\d+$/.test(
          providerJobId,
        )
      ) {
        throw new Error(
          `Unexpected Vertex AI batch job name: ${providerJobId}`,
        );
      }
      const job = (await request({
        url: `https://${host}/v1/${providerJobId}`,
        responseType: "json",
      })) as {
        state?: string;
        outputInfo?: { gcsOutputDirectory?: string };
        error?: { message?: string };
      };
      const state = job.state ?? "JOB_STATE_UNSPECIFIED";
      if (!TERMINAL_STATES.has(state)) return { state: "running" };

      const results = job.outputInfo?.gcsOutputDirectory
        ? parseVertexBatchOutput(
            await readOutputLines(job.outputInfo.gcsOutputDirectory),
          )
        : new Map<string, LlmBatchItemResult>();

      const isSuccess =
        state === "JOB_STATE_SUCCEEDED" ||
        state === "JOB_STATE_PARTIALLY_SUCCEEDED";
      return {
        state: "done",
        results,
        jobError: isSuccess
          ? undefined
          : `Vertex AI batch job ended in ${state}${
              job.error?.message ? `: ${job.error.message}` : ""
            }`,
      };
    },
  };
}

const VERTEX_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

/**
 * Batch provider for a Vertex AI LLM connection with a `batch` config. Uses
 * the connection's service account (or ADC where allowed) for both Cloud
 * Storage and Vertex AI.
 */
export async function createVertexBatchProvider(params: {
  /** Decrypted secret: service account JSON or the ADC sentinel. */
  apiKey: string;
  config: LLMConnectionConfig | null | undefined;
}): Promise<LlmBatchProvider> {
  const config = VertexAIConfigSchema.parse(params.config ?? {});
  if (!config.batchGcsUri) {
    throw new Error("LLM connection has no batch configuration");
  }
  const connection = await resolveVertexConnection({
    apiKey: params.apiKey,
    config: params.config,
    credentialSource: "user",
  });
  // One client per tick and connection: a rotated key takes effect at once.
  const auth = new GoogleAuth({
    ...connection.googleAuthOptions,
    scopes: VERTEX_SCOPES,
  });
  const client = await auth.getClient();

  return createVertexBatchProviderWithRequest({
    project: connection.project,
    location: connection.location,
    gcsUri: config.batchGcsUri,
    request: async ({ url, method, body, headers, responseType }) => {
      const res = await client.request({
        url,
        method: method ?? "GET",
        headers,
        data: body,
        responseType,
      });
      return res.data;
    },
  });
}
