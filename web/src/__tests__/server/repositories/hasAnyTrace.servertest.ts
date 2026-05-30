import { prisma } from "@langfuse/shared/src/db";
import { hasAnyTrace, createTracesCh, createEventsCh } from "@langfuse/shared/src/server";
import { createTrace, createEvent, createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import waitForExpect from "wait-for-expect";

describe("hasAnyTrace", () => {
  it("should return true immediately when PG hasTraces flag is set", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

    // Set the PG flag directly — no ClickHouse data needed
    await prisma.project.update({
      where: { id: projectId },
      data: { hasTraces: true },
    });

    const result = await hasAnyTrace(projectId);
    expect(result).toBe(true);
  });

  it("should return true and persist PG flag when ClickHouse has traces", async () => {
    const { projectId } = await createOrgProjectAndApiKey();

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

  it("should return true and persist PG flag when only events exist", async () => {
    const { projectId: eventsOnlyProjectId } = await createOrgProjectAndApiKey();

    const eventTraceId = v4();
    const eventSpanId = v4();
    const event = createEvent({
      id: eventSpanId,
      span_id: eventSpanId,
      project_id: eventsOnlyProjectId,
      trace_id: eventTraceId,
      parent_span_id: null,
      created_at: Date.now() * 1000,
      updated_at: Date.now() * 1000,
      event_ts: Date.now() * 1000,
    });

    await createEventsCh([event]);

    await waitForExpect(async () => {
      const result = await hasAnyTrace(eventsOnlyProjectId);
      expect(result).toBe(true);
    });

    const projectAfter = await prisma.project.findUniqueOrThrow({
      where: { id: eventsOnlyProjectId },
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
