import { prisma } from "../../../src/db";
import { encrypt } from "../../../src/encryption";
import { utcDayStartMs } from "./rng";
import {
  type ScenarioContext,
  type ScenarioDefinition,
  SeedError,
  type SeedSummary,
} from "./types";

const BLOB_STATES = ["timeout", "disabled", "none"] as const;
const POSTHOG_STATES = ["disabled", "none"] as const;

const CLICKHOUSE_TIMEOUT_ERROR =
  "Code: 159. DB::Exception: Timeout exceeded: elapsed 3634811.236443 ms, maximum: 3605000 ms. (TIMEOUT_EXCEEDED) (version 26.4.1.2359 (official build)) [query_id: 34cc7084-a84a-41fb-b7af-f7da11538ca6]";
const BLOB_CREDENTIALS_ERROR =
  "The AWS Access Key Id you provided does not exist in our records.";
const POSTHOG_HOSTNAME_ERROR =
  "PostHog hostname could not be reached: the host resolves to a blocked address.";

// Far enough out that a local worker never picks the integration up and
// overwrites the seeded error with a real run.
const NEVER = new Date("2099-01-01T00:00:00Z");

const parseState = <T extends string>(
  flag: string,
  value: unknown,
  states: readonly T[],
): T => {
  if (!states.includes(value as T)) {
    throw new SeedError(
      `--${flag} must be one of ${states.join(", ")} — got "${String(value)}"`,
    );
  }
  return value as T;
};

const seedBlobStorage = async (
  ctx: ScenarioContext,
  state: "timeout" | "disabled",
) => {
  const row = {
    type: "S3" as const,
    bucketName: `${ctx.idPrefix}-exports`,
    prefix: "langfuse/",
    accessKeyId: "AKIASEEDNOTVALID",
    secretAccessKey: encrypt("seed-secret-not-valid"),
    region: "us-east-1",
    forcePathStyle: false,
    enabled: state === "timeout",
    exportFrequency: "daily",
    fileType: "CSV" as const,
    lastSyncAt: new Date(utcDayStartMs()),
    nextSyncAt: NEVER,
    lastError:
      state === "timeout" ? CLICKHOUSE_TIMEOUT_ERROR : BLOB_CREDENTIALS_ERROR,
    lastErrorAt: new Date(utcDayStartMs()),
    runStartedAt: null,
  };
  await prisma.blobStorageIntegration.upsert({
    where: { projectId: ctx.projectId },
    create: { projectId: ctx.projectId, ...row },
    update: row,
  });
};

const seedPosthog = async (ctx: ScenarioContext) => {
  const row = {
    encryptedPosthogApiKey: encrypt("phc_seed_not_valid"),
    posthogHostName: "https://posthog.invalid",
    enabled: false,
    lastError: POSTHOG_HOSTNAME_ERROR,
    lastErrorAt: new Date(utcDayStartMs()),
  };
  await prisma.posthogIntegration.upsert({
    where: { projectId: ctx.projectId },
    create: { projectId: ctx.projectId, ...row },
    update: row,
  });
};

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const blobState = parseState("blob-storage", params["blob-storage"], [
    ...BLOB_STATES,
  ]);
  const posthogState = parseState("posthog", params.posthog, [
    ...POSTHOG_STATES,
  ]);

  const counts = {
    blobStorageIntegrations: blobState === "none" ? 0 : 1,
    posthogIntegrations: posthogState === "none" ? 0 : 1,
  };
  const settingsUrl = `${ctx.baseUrl}/project/${ctx.projectId}/settings`;
  const links = [
    ...(counts.blobStorageIntegrations
      ? [`${settingsUrl}/integrations/blobstorage`]
      : []),
    ...(counts.posthogIntegrations
      ? [`${settingsUrl}/integrations/posthog`]
      : []),
    `${settingsUrl}/issue-detection`,
  ];
  const summary = {
    scenario: "failing-integrations",
    target: "clickhouse" as const,
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds: [],
    sessionIds: [],
    counts,
    links,
  };

  if (ctx.dryRun) {
    return {
      ...summary,
      verified: {},
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  if (blobState !== "none") {
    ctx.log(`writing ${blobState} blob storage integration`);
    await seedBlobStorage(ctx, blobState);
  }
  if (posthogState !== "none") {
    ctx.log("writing disabled PostHog integration");
    await seedPosthog(ctx);
  }

  const [blobStorage, posthog] = await Promise.all([
    prisma.blobStorageIntegration.findUnique({
      where: { projectId: ctx.projectId },
      select: { enabled: true, lastError: true },
    }),
    prisma.posthogIntegration.findUnique({
      where: { projectId: ctx.projectId },
      select: { enabled: true, lastError: true },
    }),
  ]);
  const verified = {
    blobStorageIntegrations:
      blobState !== "none" &&
      blobStorage?.enabled === (blobState === "timeout") &&
      blobStorage.lastError
        ? 1
        : 0,
    posthogIntegrations:
      posthogState !== "none" && posthog?.enabled === false && posthog.lastError
        ? 1
        : 0,
  };
  if (
    verified.blobStorageIntegrations !== counts.blobStorageIntegrations ||
    verified.posthogIntegrations !== counts.posthogIntegrations
  ) {
    throw new SeedError(
      `failing-integrations readback mismatch: expected ${JSON.stringify(counts)}, got ${JSON.stringify(verified)}`,
    );
  }

  return {
    ...summary,
    verified,
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

export const failingIntegrationsScenario: ScenarioDefinition = {
  name: "failing-integrations",
  description:
    "Blob storage and PostHog integrations in failed states for the admin issue checks: a CSV blob export whose last run hit a ClickHouse timeout (suggest Parquet), or a blob export disabled after a credentials error, plus a PostHog export disabled after a hostname error. One blob integration per project, so seed the disabled blob state into a second project. Integrations are never scheduled, so a local worker leaves them alone.",
  supportsV4: false,
  flags: [
    {
      flag: "blob-storage",
      type: "string",
      default: "timeout",
      description: `blob storage state: ${BLOB_STATES.join(" | ")}`,
    },
    {
      flag: "posthog",
      type: "string",
      default: "disabled",
      description: `PostHog state: ${POSTHOG_STATES.join(" | ")}`,
    },
  ],
  run,
};
