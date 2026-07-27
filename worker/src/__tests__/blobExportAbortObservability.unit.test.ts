import { describe, expect, it, vi, beforeEach } from "vitest";

// Captured recordIncrement calls so we can assert the abortReason tag is
// emitted on the failure metric. Hoisted so the module mock can close over it.
const incrementCalls = vi.hoisted(
  () => [] as { stat: string; tags: Record<string, string | number> }[],
);
const errorLogs = vi.hoisted(() => [] as { msg: string; meta: unknown }[]);

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    blobStorageIntegration: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    project: { findUnique: vi.fn().mockResolvedValue({ name: "p" }) },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();

  // Mirrors enrichWithQueryId: a real CH exception with a query_id appended.
  async function* throwsChException(): AsyncGenerator<Record<string, unknown>> {
    const root = new Error("Code: 241. DB::Exception: Memory limit exceeded");
    throw new Error(`${root.message} [query_id: qid-xyz]`, { cause: root });
    // eslint-disable-next-line no-unreachable
    yield {};
  }
  async function* empty(): AsyncGenerator<Record<string, unknown>> {
    // no rows
  }

  return {
    ...mod,
    recordIncrement: vi.fn(
      (stat: string, _value?: number, tags?: Record<string, string | number>) =>
        incrementCalls.push({ stat, tags: tags ?? {} }),
    ),
    logger: {
      ...mod.logger,
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn((msg: string, meta: unknown) =>
        errorLogs.push({ msg, meta }),
      ),
    },
    StorageServiceFactory: {
      getInstance: () => ({
        uploadFileBuffered: vi.fn(async (params: any) => {
          // Draining the pipeline stream throws the CH error mid-stream — the
          // real teardown path the worker sees in prod.
          for await (const _chunk of params.data) {
            void _chunk;
          }
          return undefined;
        }),
      }),
    },
    getTracesForBlobStorageExport: () => empty(),
    getScoresForBlobStorageExport: () => empty(),
    getObservationsForBlobStorageExport: () => throwsChException(),
    createModelCache: () => ({ getModel: async () => null }),
    blobStorageEndpointConnectionValidationOptions: () => undefined,
  };
});

import { prisma } from "@langfuse/shared/src/db";
import { handleBlobStorageIntegrationProjectJob } from "../features/blobstorage/handleBlobStorageIntegrationProjectJob";
import type { Job } from "bullmq";

function makeJob(): Job<any> {
  return {
    id: "job-1",
    attemptsMade: 0,
    data: { id: "payload-1", payload: { projectId: "project-1" } },
  } as unknown as Job<any>;
}

function baseRow() {
  return {
    projectId: "project-1",
    type: "S3",
    bucketName: "bucket",
    prefix: "",
    accessKeyId: "k",
    secretAccessKey: null,
    region: "auto",
    endpoint: null,
    forcePathStyle: false,
    enabled: true,
    exportFrequency: "daily",
    fileType: "JSONL",
    exportMode: "FROM_CUSTOM_DATE",
    exportStartDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
    exportSource: "TRACES_OBSERVATIONS",
    exportFieldGroups: ["core"],
    compressed: false,
    lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    exportTuning: null,
  };
}

describe("blob export abort observability", () => {
  beforeEach(() => {
    incrementCalls.length = 0;
    errorLogs.length = 0;
    vi.clearAllMocks();
    (prisma.blobStorageIntegration.findUnique as any).mockResolvedValue(
      baseRow(),
    );
  });

  it("surfaces a mid-stream ClickHouse teardown as abortReason=ch-error", async () => {
    await expect(
      handleBlobStorageIntegrationProjectJob(makeJob()),
    ).rejects.toBeTruthy();

    // Failure metric carries the classified abort reason for the observations
    // table (the one whose CH read threw).
    const failure = incrementCalls.find(
      (c) =>
        c.stat === "langfuse.blobstorage.table_export.count" &&
        c.tags.outcome === "failure" &&
        c.tags.table === "observations",
    );
    expect(failure).toBeDefined();
    expect(failure?.tags.abortReason).toBe("ch-error");

    // Per-table error log names the reason, stage, and preserves the query_id.
    const exportErr = errorLogs.find((l) =>
      l.msg.includes("Error exporting observations"),
    );
    expect(exportErr).toBeDefined();
    expect(exportErr?.msg).toContain("abortReason=ch-error");
    expect(exportErr?.msg).toContain("abortStage=ch-read");
    expect(exportErr?.msg).toContain("[query_id: qid-xyz]");
  });
});
