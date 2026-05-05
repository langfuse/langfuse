import { expect, describe, it, vi, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  clickhouseClient,
  createOrgProjectAndApiKey,
  getDeletedProjects,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { BatchProjectBlobCleaner } from "../features/batch-project-blob-cleaner";

// vi.hoisted ensures this is declared before vi.mock's hoisted factory runs.
// Without it, the variable would be undefined when the factory executes.
const { mockRemoveIngestionEvents } = vi.hoisted(() => ({
  mockRemoveIngestionEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    getDeletedProjects: vi.fn(),
    removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject: (
      ...args: unknown[]
    ) => mockRemoveIngestionEvents(...args),
  };
});

async function insertBlobRefs(projectId: string, count: number): Promise<void> {
  const values = Array.from({ length: count }, () => ({
    id: randomUUID(),
    project_id: projectId,
    entity_type: "trace",
    entity_id: randomUUID(),
    event_id: randomUUID(),
    bucket_name: "test-bucket",
    bucket_path: `${projectId}/traces/${randomUUID()}.json`,
    created_at: new Date().getTime(),
    updated_at: new Date().getTime(),
    event_ts: new Date().getTime(),
    is_deleted: 0,
  }));

  await clickhouseClient().insert({
    table: "blob_storage_file_log",
    format: "JSONEachRow",
    values,
  });
}

async function softDeleteBlobRefs(
  projectId: string,
  count: number,
): Promise<void> {
  const values = Array.from({ length: count }, () => ({
    id: randomUUID(),
    project_id: projectId,
    entity_type: "trace",
    entity_id: randomUUID(),
    event_id: randomUUID(),
    bucket_name: "test-bucket",
    bucket_path: `${projectId}/traces/${randomUUID()}.json`,
    created_at: new Date().getTime(),
    updated_at: new Date().getTime(),
    event_ts: new Date().getTime(),
    is_deleted: 1,
  }));

  await clickhouseClient().insert({
    table: "blob_storage_file_log",
    format: "JSONEachRow",
    values,
  });
}

function getCalledProjectIds(): string[] {
  return mockRemoveIngestionEvents.mock.calls.map((call) => call[0]);
}

describe("BatchProjectBlobCleaner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should process soft-deleted project with blob refs", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    vi.mocked(getDeletedProjects).mockResolvedValue([{ id: projectId }]);
    await insertBlobRefs(projectId, 3);

    const cleaner = new BatchProjectBlobCleaner();
    await cleaner.processBatch();

    expect(mockRemoveIngestionEvents).toHaveBeenCalledWith(
      projectId,
      undefined,
    );
  });

  it("should skip when no deleted projects exist", async () => {
    vi.mocked(getDeletedProjects).mockResolvedValue([]);

    const cleaner = new BatchProjectBlobCleaner();
    await cleaner.processBatch();

    expect(mockRemoveIngestionEvents).not.toHaveBeenCalled();
  });

  it("should skip soft-deleted project with no remaining blob refs", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    vi.mocked(getDeletedProjects).mockResolvedValue([{ id: projectId }]);

    // Insert equal is_deleted=0 and is_deleted=1 rows → net count = 0
    await insertBlobRefs(projectId, 5);
    await softDeleteBlobRefs(projectId, 5);

    const cleaner = new BatchProjectBlobCleaner();
    await cleaner.processBatch();

    expect(getCalledProjectIds()).not.toContain(projectId);
  });

  it("should skip soft-deleted project with no blob refs in ClickHouse at all", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    vi.mocked(getDeletedProjects).mockResolvedValue([{ id: projectId }]);

    // No blob refs inserted for this project

    const cleaner = new BatchProjectBlobCleaner();
    await cleaner.processBatch();

    expect(getCalledProjectIds()).not.toContain(projectId);
  });

  it("should pick project with most remaining blobs", async () => {
    const { projectId: smallProject } = await createOrgProjectAndApiKey();
    const { projectId: largeProject } = await createOrgProjectAndApiKey();

    vi.mocked(getDeletedProjects).mockResolvedValue([
      { id: smallProject },
      { id: largeProject },
    ]);

    await insertBlobRefs(smallProject, 2);
    await insertBlobRefs(largeProject, 10);

    const cleaner = new BatchProjectBlobCleaner();
    await cleaner.processBatch();

    // Should pick largeProject (most blobs), not smallProject
    expect(mockRemoveIngestionEvents.mock.calls[0][0]).toBe(largeProject);
  });
});
