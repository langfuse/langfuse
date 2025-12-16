/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  createEventsCh,
  createEvent,
} from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";

const __orgIds: string[] = [];

// Helper to wait for ClickHouse to process data
const waitForClickHouse = (ms = 2000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  __orgIds.push(org.id);

  return { project, org, session, ctx, caller };
}

describe("events.batchIO trpc endpoint", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });

  maybe("events.batchIO", () => {
    it("should require authentication", async () => {
      const { project } = await prepare();

      // Create caller without session
      const unauthCtx = createInnerTRPCContext({
        session: null,
        headers: {},
      });
      const unauthCaller = appRouter.createCaller({ ...unauthCtx, prisma });

      await expect(
        unauthCaller.events.batchIO({
          projectId: project.id,
          observations: [],
        }),
      ).rejects.toThrow();
    });

    it("should fetch I/O and metadata for multiple observations", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const observation1Id = randomUUID();
      const observation2Id = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create events with I/O and metadata
      const events = [
        createEvent({
          id: observation1Id,
          span_id: observation1Id,
          project_id: project.id,
          trace_id: traceId,
          type: "GENERATION",
          name: "test-observation-1",
          input: "Input for observation 1",
          output: "Output for observation 1",
          metadata: { key1: "value1", test: true },
          start_time: nowMicro,
        }),
        createEvent({
          id: observation2Id,
          span_id: observation2Id,
          project_id: project.id,
          trace_id: traceId,
          type: "SPAN",
          name: "test-observation-2",
          input: "Input for observation 2",
          output: "Output for observation 2",
          metadata: { key2: "value2", environment: "staging" },
          start_time: nowMicro + 1000,
        }),
      ];

      await createEventsCh(events);
      await waitForClickHouse();

      // Call batchIO endpoint
      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [
          { id: observation1Id, traceId, timestamp },
          { id: observation2Id, traceId, timestamp },
        ],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(2);

      const io1 = result.find((r) => r.id === observation1Id);
      expect(io1).toBeDefined();
      expect(io1?.input).toBe("Input for observation 1");
      expect(io1?.output).toBe("Output for observation 1");
      expect(io1?.metadata).toBeDefined();
      expect(io1?.metadata?.key1).toBe("value1");
      expect(io1?.metadata?.test).toBe(true);

      const io2 = result.find((r) => r.id === observation2Id);
      expect(io2).toBeDefined();
      expect(io2?.input).toBe("Input for observation 2");
      expect(io2?.output).toBe("Output for observation 2");
      expect(io2?.metadata).toBeDefined();
      expect(io2?.metadata?.key2).toBe("value2");
      expect(io2?.metadata?.environment).toBe("staging");
    });

    it("should handle empty observations array", async () => {
      const { project, caller } = await prepare();

      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [],
      });

      expect(result).toBeDefined();
      expect(result).toEqual([]);
    });

    it("should validate projectId authorization", async () => {
      const { caller } = await prepare();
      const unauthorizedProjectId = randomUUID();

      // This should fail because the user doesn't have access to this project
      await expect(
        caller.events.batchIO({
          projectId: unauthorizedProjectId,
          observations: [
            {
              id: randomUUID(),
              traceId: randomUUID(),
              timestamp: new Date(),
            },
          ],
        }),
      ).rejects.toThrow();
    });

    it("should return null for observations without I/O and empty metadata", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const observationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create event without I/O
      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: project.id,
        trace_id: traceId,
        type: "SPAN",
        name: "test-no-io",
        // No input/output/metadata
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [{ id: observationId, traceId, timestamp }],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(observationId);
      expect(result[0]?.input).toBeNull();
      expect(result[0]?.output).toBeNull();
      expect(result[0]?.metadata).toBeDefined();
      expect(Object.keys(result[0]?.metadata ?? {})).toHaveLength(0);
    });

    it("should truncate I/O to character limit", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const observationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create very long input and output (> 1000 chars)
      const longInput = "x".repeat(2000);
      const longOutput = "y".repeat(2000);

      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: project.id,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-long-io",
        input: longInput,
        output: longOutput,
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [{ id: observationId, traceId, timestamp }],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(observationId);
      expect(result[0]?.input?.length).toBe(
        env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT,
      );
      expect(result[0]?.output?.length).toBe(
        env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT,
      );
    });

    it("should handle partial results when some observations not found", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const existingId = randomUUID();
      const nonExistentId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create only one event
      const event = createEvent({
        id: existingId,
        span_id: existingId,
        project_id: project.id,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-existing",
        input: "Existing input",
        output: "Existing output",
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      // Request I/O for both existing and non-existent
      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [
          { id: existingId, traceId, timestamp },
          { id: nonExistentId, traceId, timestamp },
        ],
      });

      // Should only return the existing one
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(existingId);
      expect(result[0]?.input).toBe("Existing input");
      expect(result[0]?.output).toBe("Existing output");
    });

    it("should handle JSON input/output correctly", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const observationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create event with JSON input/output
      const jsonInput = JSON.stringify({
        prompt: "Hello",
        params: { temp: 0.7 },
      });
      const jsonOutput = JSON.stringify({ response: "Hi there!", tokens: 10 });

      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: project.id,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-json-io",
        input: jsonInput,
        output: jsonOutput,
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [{ id: observationId, traceId, timestamp }],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(observationId);
      expect(result[0]?.input).toBe(jsonInput);
      expect(result[0]?.output).toBe(jsonOutput);
    });

    it("should filter by projectId correctly - should not return data from other projects", async () => {
      const { project: project1, caller } = await prepare();
      const { project: project2 } = await prepare();

      const traceId = randomUUID();
      const observationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create event in project2
      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: project2.id,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-different-project",
        input: "Secret input",
        output: "Secret output",
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      // Try to fetch with project1 (should not return anything)
      const result = await caller.events.batchIO({
        projectId: project1.id,
        observations: [{ id: observationId, traceId, timestamp }],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });
});
