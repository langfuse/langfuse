import { createHash } from "node:crypto";

import { DEFAULT_SEED_API_KEY } from "../utils/postgres-seed-constants";
import { utcDayStartMs } from "./rng";
import {
  type ScenarioContext,
  type ScenarioDefinition,
  SeedError,
  type SeedSummary,
} from "./types";

// Mirrors LONG_METADATA_VALUE_THRESHOLD in the admin issue rule.
const THRESHOLD = 200;
const READBACK_TIMEOUT_MS = 60_000;
const READBACK_INTERVAL_MS = 2_000;

const apiHeaders = {
  Authorization: `Basic ${Buffer.from(
    `${DEFAULT_SEED_API_KEY.public}:${DEFAULT_SEED_API_KEY.secret}`,
  ).toString("base64")}`,
  "Content-Type": "application/json",
};

const hexId = (seed: string, length: number) =>
  createHash("sha256").update(seed).digest("hex").slice(0, length);

const repeatTo = (text: string, length: number) =>
  text.repeat(Math.ceil(length / text.length)).slice(0, length);

/**
 * A retrieval step whose metadata carries two long values (the retrieved
 * context and a prompt snapshot) next to short, filterable ones.
 */
const buildMetadata = (valueLength: number): Record<string, string> => ({
  customer_tier: "enterprise",
  region: "eu-west-1",
  retrieved_context: repeatTo(
    "Northwind return policy: unused items within 30 days get a full refund to the original payment method; used or late items get store credit. ",
    valueLength,
  ),
  system_prompt_snapshot: repeatTo(
    "You are Aurora, the support assistant for Northwind Outfitters. Answer using only the retrieved context. ",
    Math.ceil(valueLength / 2) + THRESHOLD,
  ),
});

const request = async (
  ctx: ScenarioContext,
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const response = await fetch(`${ctx.baseUrl}${path}`, {
    ...init,
    headers: { ...apiHeaders, ...init?.headers },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new SeedError(
      `API ${init?.method ?? "GET"} ${path} returned ${response.status}: ${detail}`,
      "target a running, seeded local or preview environment with the default synthetic API key",
    );
  }
  return response;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const valueLength = params["value-length"] as number;
  if (valueLength <= THRESHOLD) {
    throw new SeedError(
      `--value-length must be greater than ${THRESHOLD}, got ${valueLength}`,
      `only values longer than ${THRESHOLD} characters raise the issue; pass e.g. --value-length 800`,
    );
  }

  const traceId = hexId(`${ctx.idPrefix}:trace`, 32);
  const spanId = hexId(`${ctx.idPrefix}:span`, 16);
  const metadata = buildMetadata(valueLength);
  const longKeys = Object.entries(metadata).filter(
    ([, value]) => value.length > THRESHOLD,
  );
  const startMs = utcDayStartMs();
  const links = [
    `${ctx.baseUrl}/project/${ctx.projectId}/traces/${traceId}?observation=${spanId}`,
    `${ctx.baseUrl}/project/${ctx.projectId}/settings/issue-detection`,
  ];
  const summary = (verified: Record<string, number>): SeedSummary => ({
    scenario: "long-metadata-values",
    target: "api",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [traceId],
    sessionIds: [],
    counts: { observations: 1, longMetadataKeys: longKeys.length },
    verified,
    links,
    dryRun: ctx.dryRun,
    durationMs: Date.now() - startedAt,
  });

  if (ctx.dryRun) return summary({});

  ctx.log(
    `sending 1 span with ${longKeys.length} metadata values over ${THRESHOLD} characters via ${ctx.baseUrl}`,
  );
  await request(ctx, "/api/public/otel/v1/traces", {
    method: "POST",
    headers: { "x-langfuse-ingestion-version": "4" },
    body: JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "seed" } },
              {
                key: "deployment.environment",
                value: { stringValue: ctx.environment },
              },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "langfuse-seed", version: "1.0.0" },
              spans: [
                {
                  traceId,
                  spanId,
                  name: "retrieve-context",
                  kind: 1,
                  startTimeUnixNano: `${startMs}000000`,
                  endTimeUnixNano: `${startMs + 850}000000`,
                  attributes: Object.entries(metadata).map(([key, value]) => ({
                    key: `langfuse.observation.metadata.${key}`,
                    value: { stringValue: value },
                  })),
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  ctx.log("waiting for the worker to ingest the span");
  const query = new URLSearchParams({
    traceId,
    fields: "core,metadata",
    fromStartTime: new Date(startMs - 1_000).toISOString(),
  });
  const deadline = Date.now() + READBACK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await request(
      ctx,
      `/api/public/v2/observations?${query.toString()}`,
    );
    const { data } = (await response.json()) as {
      data: { id: string; metadata?: Record<string, unknown> }[];
    };
    const observation = data.find(({ id }) => id === spanId);
    if (observation) {
      // The list API returns metadata values cut to THRESHOLD characters.
      const stored = longKeys.filter(([key, value]) => {
        const returned = observation.metadata?.[key];
        return (
          typeof returned === "string" &&
          returned.length >= THRESHOLD &&
          value.startsWith(returned)
        );
      });
      if (stored.length !== longKeys.length) {
        throw new SeedError(
          `Readback mismatch: ${stored.length}/${longKeys.length} long metadata values were stored for observation ${spanId}`,
        );
      }
      return summary({ observations: 1, longMetadataKeys: stored.length });
    }
    await sleep(READBACK_INTERVAL_MS);
  }

  throw new SeedError(
    `Observation ${spanId} did not appear within ${READBACK_TIMEOUT_MS / 1000}s`,
    "start the worker (pnpm run dev:worker); it ingests the span and raises the admin issue",
  );
};

export const longMetadataValuesScenario: ScenarioDefinition = {
  name: "long-metadata-values",
  description: `One retrieval span whose metadata carries two values longer than ${THRESHOLD} characters next to short ones, sent through the public OTel endpoint. The ingesting worker raises the "Long metadata values" admin issue for the project. Works against seeded local and PR preview environments.`,
  supportsV4: false,
  target: "api",
  flags: [
    {
      flag: "value-length",
      type: "number",
      default: 800,
      description: `characters in the longest metadata value (must exceed ${THRESHOLD})`,
    },
  ],
  run,
};
