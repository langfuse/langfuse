/** @jest-environment node */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("Observations Comment Filtering", () => {
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
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
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

  // Helper to create standard query params
  const createQueryParams = (filter: any[]) => ({
    projectId,
    filter,
    searchQuery: null,
    searchType: [] as any[],
    orderBy: null as any,
    page: 0,
    limit: 10,
  });

  describe("Comment Count Filter", () => {
    it("should filter observations with >= 2 comments", async () => {
      // Create traces and observations
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      const trace2 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace1, trace2]);

      const observation1 = createObservation({
        project_id: projectId,
        trace_id: trace1.id,
        type: "GENERATION",
      });
      const observation2 = createObservation({
        project_id: projectId,
        trace_id: trace2.id,
        type: "GENERATION",
      });
      await createObservationsCh([observation1, observation2]);

      // Add 2 comments to observation1
      await prisma.comment.createMany({
        data: [
          {
            projectId,
            objectType: "OBSERVATION",
            objectId: observation1.id,
            content: "First comment",
            authorUserId: "user-1",
          },
          {
            projectId,
            objectType: "OBSERVATION",
            objectId: observation1.id,
            content: "Second comment",
            authorUserId: "user-1",
          },
        ],
      });

      // Add 1 comment to observation2
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "OBSERVATION",
          objectId: observation2.id,
          content: "Only one comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.generations.all(
        createQueryParams([
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 2,
          },
        ]),
      );

      // Should get observation1 (has >= 2 comments)
      const observationIds = result.generations.map((o) => o.id);
      expect(observationIds).toContain(observation1.id);
      // observation2 has only 1 comment, should not be included
      expect(observationIds).not.toContain(observation2.id);
    });
  });

  describe("Comment Content Filter", () => {
    it("should filter observations by comment content (contains)", async () => {
      // Create traces and observations
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      const trace2 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace1, trace2]);

      const observation1 = createObservation({
        project_id: projectId,
        trace_id: trace1.id,
        type: "GENERATION",
      });
      const observation2 = createObservation({
        project_id: projectId,
        trace_id: trace2.id,
        type: "GENERATION",
      });
      await createObservationsCh([observation1, observation2]);

      // Add comments with different content
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "OBSERVATION",
          objectId: observation1.id,
          content: "This observation has a bug in the output",
          authorUserId: "user-1",
        },
      });

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "OBSERVATION",
          objectId: observation2.id,
          content: "Observation works perfectly",
          authorUserId: "user-1",
        },
      });

      const result = await caller.generations.all(
        createQueryParams([
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: "bug",
          },
        ]),
      );

      const observationIds = result.generations.map((o) => o.id);
      expect(observationIds).toContain(observation1.id);
      expect(observationIds).not.toContain(observation2.id);
    });
  });

  describe("Combined Filters (AND Logic)", () => {
    it("should combine comment count + content filters", async () => {
      // Create trace and observation
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        type: "GENERATION",
      });
      await createObservationsCh([observation]);

      // Add 2 comments with "bug" in content
      await prisma.comment.createMany({
        data: [
          {
            projectId,
            objectType: "OBSERVATION",
            objectId: observation.id,
            content: "Found a bug here",
            authorUserId: "user-1",
          },
          {
            projectId,
            objectType: "OBSERVATION",
            objectId: observation.id,
            content: "Confirmed the bug",
            authorUserId: "user-1",
          },
        ],
      });

      const result = await caller.generations.all(
        createQueryParams([
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 2,
          },
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: "bug",
          },
        ]),
      );

      const observationIds = result.generations.map((o) => o.id);
      expect(observationIds).toContain(observation.id);
    });
  });

  describe("Count Query", () => {
    it("should return correct count with comment filter", async () => {
      // Create trace and observation
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        type: "GENERATION",
      });
      await createObservationsCh([observation]);

      // Add comment
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "OBSERVATION",
          objectId: observation.id,
          content: "Test comment for counting",
          authorUserId: "user-1",
        },
      });

      const countResult = await caller.generations.countAll({
        projectId,
        filter: [
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 1,
          },
        ],
        searchQuery: null,
        searchType: [] as any[],
        orderBy: null as any,
        page: 0,
        limit: 10,
      });

      expect(typeof countResult.totalCount).toBe("number");
      expect(countResult.totalCount).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle range filters correctly (>=1 AND <=100)", async () => {
      // Create trace and observation
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        type: "GENERATION",
      });
      await createObservationsCh([observation]);

      // Add comment
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "OBSERVATION",
          objectId: observation.id,
          content: "Test comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.generations.all(
        createQueryParams([
          {
            type: "datetime",
            column: "startTime",
            operator: ">=",
            value: new Date(Date.now() - 5000).toISOString(), // Last 5 seconds
          },
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 1,
          },
          {
            type: "number",
            column: "commentCount",
            operator: "<=",
            value: 100,
          },
        ]),
      );

      const observationIds = result.generations.map((o) => o.id);
      expect(observationIds).toContain(observation.id);
    });

    it("should return empty results when no observations match range", async () => {
      // Create trace and observation
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        type: "GENERATION",
      });
      await createObservationsCh([observation]);

      // Add comment
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "OBSERVATION",
          objectId: observation.id,
          content: "Test comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.generations.all(
        createQueryParams([
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 5, // No observation has 5+ comments
          },
        ]),
      );

      expect(result.generations).toEqual([]);
    });

    it("should handle special characters in search query", async () => {
      // Create trace and observation
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        type: "GENERATION",
      });
      await createObservationsCh([observation]);

      // Add comment with special characters
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "OBSERVATION",
          objectId: observation.id,
          content: "Error: (test & validation) failed!",
          authorUserId: "user-1",
        },
      });

      // Should not throw SQL syntax error with special characters
      const result = await caller.generations.all(
        createQueryParams([
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: "test & validation",
          },
        ]),
      );

      const observationIds = result.generations.map((o) => o.id);
      expect(observationIds).toContain(observation.id);
    });
  });
});
