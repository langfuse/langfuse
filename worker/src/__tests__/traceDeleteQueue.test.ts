import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { traceDeleteProcessor } from "../queues/traceDelete";
import {
  QueueJobs,
  QueueName,
  TQueueJobTypes,
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  getTracesByIds,
} from "@langfuse/shared/src/server";
import { Job } from "bullmq";

describe("trace deletion queue processor", () => {
  let projectId: string;

  beforeEach(async () => {
    // Create a real project for testing
    const result = await createOrgProjectAndApiKey();
    projectId = result.projectId;

    // Clean up any existing test data
    await prisma.pendingDeletion.deleteMany({
      where: { projectId },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.pendingDeletion.deleteMany({
      where: { projectId },
    });
  });

  const createMockJob = (
    traceIds: string[],
  ): Job<TQueueJobTypes[QueueName.TraceDelete]> => {
    return {
      data: {
        timestamp: new Date(),
        id: randomUUID(),
        name: QueueJobs.TraceDelete,
        payload: {
          projectId,
          traceIds,
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceDelete]>;
  };

  it("should process traces not in pending_deletions table", async () => {
    // Setup: Create traces in ClickHouse that don't exist in pending_deletions
    const eventTraceIds = [randomUUID(), randomUUID()];

    // Create traces in ClickHouse
    await createTracesCh([
      createTrace({ id: eventTraceIds[0], project_id: projectId }),
      createTrace({ id: eventTraceIds[1], project_id: projectId }),
    ]);

    // Verify traces exist in ClickHouse before deletion
    const tracesBeforeDeletion = await getTracesByIds(eventTraceIds, projectId);
    expect(tracesBeforeDeletion).toHaveLength(2);

    const job = createMockJob(eventTraceIds);

    // When
    await traceDeleteProcessor(job);

    // Then: Traces should be deleted from ClickHouse
    const tracesAfterDeletion = await getTracesByIds(eventTraceIds, projectId);
    expect(tracesAfterDeletion).toHaveLength(0);

    // And no pending deletions should be created or updated
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: { projectId },
    });
    expect(pendingDeletions).toHaveLength(0);
  });

  it("should skip traces already marked as deleted in pending_deletions", async () => {
    // Setup: Create pending deletions, some already marked as deleted
    const alreadyDeletedTrace = randomUUID();
    const notDeletedTrace = randomUUID();
    const newEventTrace = randomUUID();

    // Create all traces in ClickHouse
    await createTracesCh([
      createTrace({ id: alreadyDeletedTrace, project_id: projectId }),
      createTrace({ id: notDeletedTrace, project_id: projectId }),
      createTrace({ id: newEventTrace, project_id: projectId }),
    ]);

    // Verify all traces exist before processing
    const tracesBeforeDeletion = await getTracesByIds(
      [alreadyDeletedTrace, notDeletedTrace, newEventTrace],
      projectId,
    );
    expect(tracesBeforeDeletion).toHaveLength(3);

    await prisma.pendingDeletion.createMany({
      data: [
        {
          projectId,
          object: "trace",
          objectId: alreadyDeletedTrace,
          isDeleted: true, // Already deleted
        },
        {
          projectId,
          object: "trace",
          objectId: notDeletedTrace,
          isDeleted: false, // Not yet deleted
        },
      ],
    });

    // Event contains mix of already deleted, pending, and new traces
    const eventTraceIds = [alreadyDeletedTrace, notDeletedTrace, newEventTrace];
    const job = createMockJob(eventTraceIds);

    // When
    await traceDeleteProcessor(job);

    // Then: Only traces that weren't already deleted should be processed
    // The already deleted trace should be filtered out, so only notDeletedTrace and newEventTrace get deleted
    const tracesAfterDeletion = await getTracesByIds(
      [alreadyDeletedTrace, notDeletedTrace, newEventTrace],
      projectId,
    );
    expect(tracesAfterDeletion).toHaveLength(1); // Only alreadyDeletedTrace should remain
    expect(tracesAfterDeletion[0].id).toBe(alreadyDeletedTrace);

    // And only the not-deleted trace should be marked as deleted
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: { projectId },
      orderBy: { objectId: "asc" },
    });

    expect(pendingDeletions).toHaveLength(2);

    const alreadyDeletedRecord = pendingDeletions.find(
      (p) => p.objectId === alreadyDeletedTrace,
    );
    const notDeletedRecord = pendingDeletions.find(
      (p) => p.objectId === notDeletedTrace,
    );

    expect(alreadyDeletedRecord?.isDeleted).toBe(true); // Should remain true
    expect(notDeletedRecord?.isDeleted).toBe(true); // Should be updated to true
  });

  it("should batch process pending deletions along with event traces", async () => {
    // Setup: Create some pending deletions and event with different traces
    const pendingTrace1 = randomUUID();
    const pendingTrace2 = randomUUID();
    const eventTrace1 = randomUUID();
    const eventTrace2 = randomUUID();

    // Create all traces in ClickHouse
    await createTracesCh([
      createTrace({ id: pendingTrace1, project_id: projectId }),
      createTrace({ id: pendingTrace2, project_id: projectId }),
      createTrace({ id: eventTrace1, project_id: projectId }),
      createTrace({ id: eventTrace2, project_id: projectId }),
    ]);

    // Verify all traces exist before processing
    const tracesBeforeDeletion = await getTracesByIds(
      [pendingTrace1, pendingTrace2, eventTrace1, eventTrace2],
      projectId,
    );
    expect(tracesBeforeDeletion).toHaveLength(4);

    await prisma.pendingDeletion.createMany({
      data: [
        {
          projectId,
          object: "trace",
          objectId: pendingTrace1,
          isDeleted: false,
        },
        {
          projectId,
          object: "trace",
          objectId: pendingTrace2,
          isDeleted: false,
        },
      ],
    });

    const job = createMockJob([eventTrace1, eventTrace2]);

    // When
    await traceDeleteProcessor(job);

    // Then: All traces should be deleted from ClickHouse
    const tracesAfterDeletion = await getTracesByIds(
      [pendingTrace1, pendingTrace2, eventTrace1, eventTrace2],
      projectId,
    );
    expect(tracesAfterDeletion).toHaveLength(0);

    // And all pending traces should be marked as deleted
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: { projectId },
    });

    expect(pendingDeletions).toHaveLength(2);
    expect(pendingDeletions.every((p) => p.isDeleted)).toBe(true);
  });

  it("should handle empty event trace list with existing pending deletions", async () => {
    // Setup: Only pending deletions, no event traces
    const pendingTrace = randomUUID();

    // Create trace in ClickHouse
    await createTracesCh([
      createTrace({ id: pendingTrace, project_id: projectId }),
    ]);

    // Verify trace exists before processing
    const tracesBeforeDeletion = await getTracesByIds(
      [pendingTrace],
      projectId,
    );
    expect(tracesBeforeDeletion).toHaveLength(1);

    await prisma.pendingDeletion.create({
      data: {
        projectId,
        object: "trace",
        objectId: pendingTrace,
        isDeleted: false,
      },
    });

    const job = createMockJob([]);

    // When
    await traceDeleteProcessor(job);

    // Then: Trace should be deleted from ClickHouse
    const tracesAfterDeletion = await getTracesByIds([pendingTrace], projectId);
    expect(tracesAfterDeletion).toHaveLength(0);

    // And pending deletion should be marked as deleted
    const pendingDeletion = await prisma.pendingDeletion.findFirst({
      where: { projectId },
    });

    expect(pendingDeletion?.isDeleted).toBe(true);
  });

  it("should handle event traces that overlap with pending deletions", async () => {
    // Setup: Event trace that also exists in pending deletions
    const overlappingTrace = randomUUID();
    const eventOnlyTrace = randomUUID();
    const pendingOnlyTrace = randomUUID();

    // Create all traces in ClickHouse
    await createTracesCh([
      createTrace({ id: overlappingTrace, project_id: projectId }),
      createTrace({ id: eventOnlyTrace, project_id: projectId }),
      createTrace({ id: pendingOnlyTrace, project_id: projectId }),
    ]);

    // Verify all traces exist before processing
    const tracesBeforeDeletion = await getTracesByIds(
      [overlappingTrace, eventOnlyTrace, pendingOnlyTrace],
      projectId,
    );
    expect(tracesBeforeDeletion).toHaveLength(3);

    await prisma.pendingDeletion.createMany({
      data: [
        {
          projectId,
          object: "trace",
          objectId: overlappingTrace,
          isDeleted: false,
        },
        {
          projectId,
          object: "trace",
          objectId: pendingOnlyTrace,
          isDeleted: false,
        },
      ],
    });

    const job = createMockJob([overlappingTrace, eventOnlyTrace]);

    // When
    await traceDeleteProcessor(job);

    // Then: All traces should be deleted from ClickHouse
    const tracesAfterDeletion = await getTracesByIds(
      [overlappingTrace, eventOnlyTrace, pendingOnlyTrace],
      projectId,
    );
    expect(tracesAfterDeletion).toHaveLength(0);

    // And both pending deletions should be marked as deleted
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: { projectId },
    });

    expect(pendingDeletions).toHaveLength(2);
    expect(pendingDeletions.every((p) => p.isDeleted)).toBe(true);
  });

  it("should not process if no valid traces to delete", async () => {
    // Setup: Event with traces that are all already deleted
    const alreadyDeletedTrace = randomUUID();

    // Create trace in ClickHouse (this represents a trace that was already deleted previously)
    await createTracesCh([
      createTrace({ id: alreadyDeletedTrace, project_id: projectId }),
    ]);

    // Verify trace exists before processing
    const tracesBeforeDeletion = await getTracesByIds(
      [alreadyDeletedTrace],
      projectId,
    );
    expect(tracesBeforeDeletion).toHaveLength(1);

    await prisma.pendingDeletion.create({
      data: {
        projectId,
        object: "trace",
        objectId: alreadyDeletedTrace,
        isDeleted: true,
      },
    });

    const job = createMockJob([alreadyDeletedTrace]);

    // When
    await traceDeleteProcessor(job);

    // Then: Trace should still exist in ClickHouse since it was filtered out
    const tracesAfterDeletion = await getTracesByIds(
      [alreadyDeletedTrace],
      projectId,
    );
    expect(tracesAfterDeletion).toHaveLength(1); // Trace should remain since it was filtered out

    // And pending deletion status should remain unchanged
    const pendingDeletion = await prisma.pendingDeletion.findFirst({
      where: { projectId },
    });

    expect(pendingDeletion?.isDeleted).toBe(true); // Should remain unchanged
  });

  it("should not delete traces already marked as deleted even when in event traceIds", async () => {
    // Setup: Trace that was already processed (isDeleted: true) but appears in event
    const alreadyDeletedTrace = randomUUID();
    const validEventTrace = randomUUID();

    // Create both traces in ClickHouse
    await createTracesCh([
      createTrace({ id: alreadyDeletedTrace, project_id: projectId }),
      createTrace({ id: validEventTrace, project_id: projectId }),
    ]);

    // Verify both traces exist before processing
    const tracesBeforeDeletion = await getTracesByIds(
      [alreadyDeletedTrace, validEventTrace],
      projectId,
    );
    expect(tracesBeforeDeletion).toHaveLength(2);

    // Mark one trace as already deleted
    await prisma.pendingDeletion.create({
      data: {
        projectId,
        object: "trace",
        objectId: alreadyDeletedTrace,
        isDeleted: true, // Already processed
      },
    });

    // Event contains both the already deleted trace and a valid new trace
    const job = createMockJob([alreadyDeletedTrace, validEventTrace]);

    // When
    await traceDeleteProcessor(job);

    // Then: Only the valid event trace should be deleted from ClickHouse
    // The already deleted trace should remain untouched
    const tracesAfterDeletion = await getTracesByIds(
      [alreadyDeletedTrace, validEventTrace],
      projectId,
    );
    expect(tracesAfterDeletion).toHaveLength(1); // Only alreadyDeletedTrace should remain
    expect(tracesAfterDeletion[0].id).toBe(alreadyDeletedTrace);

    // And the pending deletion record should remain unchanged
    const pendingDeletion = await prisma.pendingDeletion.findFirst({
      where: { projectId, objectId: alreadyDeletedTrace },
    });
    expect(pendingDeletion?.isDeleted).toBe(true); // Should remain unchanged
  });

  it("should handle mixed scenario: some deleted, some pending, some new", async () => {
    // Setup: Complex scenario with all combinations
    const alreadyDeletedTrace = randomUUID();
    const pendingTrace = randomUUID();
    const newEventTrace = randomUUID();
    const overlappingTrace = randomUUID();

    // Create all traces in ClickHouse
    await createTracesCh([
      createTrace({ id: alreadyDeletedTrace, project_id: projectId }),
      createTrace({ id: pendingTrace, project_id: projectId }),
      createTrace({ id: newEventTrace, project_id: projectId }),
      createTrace({ id: overlappingTrace, project_id: projectId }),
    ]);

    // Verify all traces exist before processing
    const tracesBeforeDeletion = await getTracesByIds(
      [alreadyDeletedTrace, pendingTrace, newEventTrace, overlappingTrace],
      projectId,
    );
    expect(tracesBeforeDeletion).toHaveLength(4);

    await prisma.pendingDeletion.createMany({
      data: [
        {
          projectId,
          object: "trace",
          objectId: alreadyDeletedTrace,
          isDeleted: true, // Already processed
        },
        {
          projectId,
          object: "trace",
          objectId: pendingTrace,
          isDeleted: false, // Should be processed
        },
        {
          projectId,
          object: "trace",
          objectId: overlappingTrace,
          isDeleted: false, // Should be processed
        },
      ],
    });

    // Event contains: already deleted (skip), new (process), overlapping (process)
    const job = createMockJob([
      alreadyDeletedTrace,
      newEventTrace,
      overlappingTrace,
    ]);

    // When
    await traceDeleteProcessor(job);

    // Then: Only pending, new event, and overlapping traces should be deleted from ClickHouse
    // (already deleted trace should be skipped)
    const tracesAfterDeletion = await getTracesByIds(
      [alreadyDeletedTrace, pendingTrace, newEventTrace, overlappingTrace],
      projectId,
    );
    expect(tracesAfterDeletion).toHaveLength(1); // Only alreadyDeletedTrace should remain
    expect(tracesAfterDeletion[0].id).toBe(alreadyDeletedTrace);

    // And only pending and overlapping traces should be updated in database
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: { projectId },
      orderBy: { objectId: "asc" },
    });

    expect(pendingDeletions).toHaveLength(3);

    const alreadyDeleted = pendingDeletions.find(
      (p) => p.objectId === alreadyDeletedTrace,
    );
    const pending = pendingDeletions.find((p) => p.objectId === pendingTrace);
    const overlapping = pendingDeletions.find(
      (p) => p.objectId === overlappingTrace,
    );

    expect(alreadyDeleted?.isDeleted).toBe(true); // Unchanged
    expect(pending?.isDeleted).toBe(true); // Updated
    expect(overlapping?.isDeleted).toBe(true); // Updated
  });
});
