import { randomUUID } from "crypto";
import { expect, describe, it } from "vitest";
import {
  createTrace,
  createTracesCh,
  createOrgProjectAndApiKey,
  getTracesByIds,
  clickhouseClient,
} from "@langfuse/shared/src/server";
import { IngestionService } from "../../services/IngestionService";
import { ClickhouseWriter } from "../../services/ClickhouseWriter";
import { redis } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

describe("Issue #10436: Environment ingestion bug (Integration with real ClickHouse)", () => {
  it("should update environment from 'default' to 'staging' through full IngestionService", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const traceId = randomUUID();
    const now = new Date();

    // Create initial trace with default environment in ClickHouse
    const initialTrace = createTrace({
      id: traceId,
      project_id: projectId,
      environment: "default",
      name: "initial-trace",
      timestamp: now.getTime(),
    });
    await createTracesCh([initialTrace]);

    // Wait for ClickHouse to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Now send events through IngestionService to update to staging
    const updateEvent = {
      id: randomUUID(),
      type: "trace-create" as const,
      timestamp: new Date(now.getTime() + 1000).toISOString(),
      body: {
        id: traceId,
        environment: "staging",
        name: "updated-trace",
      },
    };

    // Use real IngestionService with real ClickHouse
    const ingestionService = new IngestionService(
      redis,
      prisma,
      ClickhouseWriter.getInstance(),
      clickhouseClient(),
    );

    await ingestionService.mergeAndWrite(
      "trace",
      projectId,
      traceId,
      new Date(now.getTime() + 1000),
      [updateEvent] as any[],
      false,
    );

    // Flush ClickHouse writer
    await ClickhouseWriter.getInstance().shutdown();

    // Wait for ClickHouse to process the write
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Query ClickHouse to verify the environment was updated
    const traces = await getTracesByIds([traceId], projectId);

    expect(traces).toHaveLength(1);
    // After fix: environment should be updated to "staging" (not stuck at "default")
    expect(traces[0].environment).toBe("staging");
  }, 30000); // 30 second timeout for async processing

  it("should preserve staging environment when set from the start", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const traceId = randomUUID();
    const now = new Date();

    // Create trace with staging environment directly
    const createEvent = {
      id: randomUUID(),
      type: "trace-create" as const,
      timestamp: now.toISOString(),
      body: {
        id: traceId,
        environment: "staging",
        name: "staging-trace",
        input: { test: "data" },
      },
    };

    const ingestionService = new IngestionService(
      redis,
      prisma,
      ClickhouseWriter.getInstance(),
      clickhouseClient(),
    );

    await ingestionService.mergeAndWrite(
      "trace",
      projectId,
      traceId,
      now,
      [createEvent] as any[],
      false,
    );

    await ClickhouseWriter.getInstance().shutdown();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const traces = await getTracesByIds([traceId], projectId);

    expect(traces).toHaveLength(1);
    expect(traces[0].environment).toBe("staging");
  }, 30000);

  it("should default to 'default' environment when not specified", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const traceId = randomUUID();
    const now = new Date();

    // Create trace without environment field
    const createEvent = {
      id: randomUUID(),
      type: "trace-create" as const,
      timestamp: now.toISOString(),
      body: {
        id: traceId,
        name: "no-env-trace",
        input: { test: "data" },
        // environment not specified
      },
    };

    const ingestionService = new IngestionService(
      redis,
      prisma,
      ClickhouseWriter.getInstance(),
      clickhouseClient(),
    );

    await ingestionService.mergeAndWrite(
      "trace",
      projectId,
      traceId,
      now,
      [createEvent] as any[],
      false,
    );

    await ClickhouseWriter.getInstance().shutdown();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const traces = await getTracesByIds([traceId], projectId);

    expect(traces).toHaveLength(1);
    expect(traces[0].environment).toBe("default");
  }, 30000);
});
