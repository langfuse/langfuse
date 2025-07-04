/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("traces trpc", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: "seed-org-id",
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
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
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  describe("generations.all", () => {
    it("should get all generations with full text search and trace + scores filter", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();
      const scoreId = randomUUID();

      // Create trace with searchable content
      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "test-trace-name",
        user_id: "test-user-123",
      });

      await createTracesCh([trace]);

      // Create generation with searchable input/output content
      const generation = createObservation({
        id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-generation",
        input: "Hello world, this is a test input",
        output: "This is a test response output",
      });

      await createObservationsCh([generation]);

      // Create score for the trace
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: traceId,
        name: "quality-score",
        value: 0.85,
      });

      await createScoresCh([score]);

      // Test with full-text search, trace filter, and score filter
      const generations = await caller.generations.all({
        projectId,
        searchQuery: "test input", // Full-text search
        searchType: ["content"], // Search in input/output content
        filter: [
          {
            column: "Trace Name",
            operator: "contains",
            value: "test-trace",
            type: "string",
          },
          {
            column: "Scores (numeric)",
            key: "test",
            operator: ">=",
            value: 5,
            type: "numberObject",
          },
        ],
        orderBy: null,
        limit: 50,
        page: 0,
      });

      expect(generations.generations).toBeDefined();
    });
  });
});
