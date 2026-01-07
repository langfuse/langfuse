import { expect, describe, it } from "vitest";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  executeWithMutationMonitoring,
  getTracesByIds,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("MutationWaiter Integration", () => {
  it("should execute DELETE with mutation monitoring and wait for completion", async () => {
    // Setup - create test data
    const { projectId } = await createOrgProjectAndApiKey();

    const traceId = randomUUID();
    await createTracesCh([createTrace({ id: traceId, project_id: projectId })]);

    // Verify trace exists before deletion
    const tracesBefore = await getTracesByIds([traceId], projectId);
    expect(tracesBefore).toHaveLength(1);

    // Execute delete with mutation monitoring
    await executeWithMutationMonitoring({
      tableName: "traces",
      query: `DELETE FROM traces WHERE project_id = {projectId: String} AND id = {traceId: String};`,
      params: {
        projectId,
        traceId,
      },
      tags: { test: "mutationWaiter" },
      timeoutMs: 60_000,
      pollIntervalMs: 500,
    });

    // Verify trace is deleted
    const tracesAfter = await getTracesByIds([traceId], projectId);
    expect(tracesAfter).toHaveLength(0);
  }, 60_000);
});
