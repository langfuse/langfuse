import { prisma } from "@langfuse/shared/src/db";
import { hasAnyTrace, createTracesCh } from "@langfuse/shared/src/server";
import { createTrace } from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("hasAnyTrace", () => {
  afterEach(async () => {
    // Reset the hasTraces flag to false after each test
    await prisma.project.update({
      where: { id: projectId },
      data: { hasTraces: false },
    });
  });

  it("should return true immediately when PG hasTraces flag is set", async () => {
    // Set the PG flag directly — no ClickHouse data needed
    await prisma.project.update({
      where: { id: projectId },
      data: { hasTraces: true },
    });

    const result = await hasAnyTrace(projectId);
    expect(result).toBe(true);
  });

  it("should return true and persist PG flag when ClickHouse has traces", async () => {
    // Ensure PG flag is false
    const projectBefore = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { hasTraces: true },
    });
    expect(projectBefore.hasTraces).toBe(false);

    // Insert a trace into ClickHouse
    const trace = createTrace({
      id: v4(),
      project_id: projectId,
      timestamp: Date.now(),
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
    });
    await createTracesCh([trace]);

    // hasAnyTrace should find the trace via ClickHouse and persist to PG
    const result = await hasAnyTrace(projectId);
    expect(result).toBe(true);

    // Verify PG flag was persisted
    const projectAfter = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { hasTraces: true },
    });
    expect(projectAfter.hasTraces).toBe(true);
  });

  it("should return false when no traces exist", async () => {
    // Use a random projectId that has no traces in either PG or ClickHouse
    const emptyProjectId = v4();
    const result = await hasAnyTrace(emptyProjectId);
    expect(result).toBe(false);
  });
});
