/** @jest-environment node */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createTrace, createTracesCh } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("Traces Comment Filtering", () => {
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
    it("should filter traces with >= 2 comments", async () => {
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace1]);

      await prisma.comment.createMany({
        data: [
          {
            projectId,
            objectType: "TRACE",
            objectId: trace1.id,
            content: "First comment",
            authorUserId: "user-1",
          },
          {
            projectId,
            objectType: "TRACE",
            objectId: trace1.id,
            content: "Second comment",
            authorUserId: "user-1",
          },
        ],
      });

      const trace2 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace2]);

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace2.id,
          content: "Only one comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.traces.all(
        createQueryParams([
          {
            type: "datetime",
            column: "timestamp",
            operator: ">=",
            value: new Date(Date.now() - 5000).toISOString(), // Last 5 seconds
          },
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 2,
          },
        ]),
      );

      // Should get trace1 (has >= 2 comments)
      const traceIds = result.traces.map((t) => t.id);
      expect(traceIds).toContain(trace1.id);
      // trace2 has only 1 comment, should not be included
      expect(traceIds).not.toContain(trace2.id);
    });
  });

  describe("Comment Content Filter", () => {
    it("should filter traces by comment content (contains)", async () => {
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace1]);

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace1.id,
          content: "This is a bug in the authentication flow",
          authorUserId: "user-1",
        },
      });

      const trace2 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace2]);

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace2.id,
          content: "Feature works perfectly",
          authorUserId: "user-1",
        },
      });

      const result = await caller.traces.all(
        createQueryParams([
          {
            type: "datetime",
            column: "timestamp",
            operator: ">=",
            value: new Date(Date.now() - 5000).toISOString(),
          },
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: "bug",
          },
        ]),
      );

      const traceIds = result.traces.map((t) => t.id);
      expect(traceIds).toContain(trace1.id);
      expect(traceIds).not.toContain(trace2.id);
    });
  });

  describe("Combined Filters (AND Logic)", () => {
    it("should combine comment count + content filters", async () => {
      const uniqueId = randomUUID();
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace1]);

      await prisma.comment.createMany({
        data: [
          {
            projectId,
            objectType: "TRACE",
            objectId: trace1.id,
            content: `Found a bug here ${uniqueId}`,
            authorUserId: "user-1",
          },
          {
            projectId,
            objectType: "TRACE",
            objectId: trace1.id,
            content: `Confirmed the bug ${uniqueId}`,
            authorUserId: "user-1",
          },
        ],
      });

      const result = await caller.traces.all(
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
            value: uniqueId,
          },
        ]),
      );

      const traceIds = result.traces.map((t) => t.id);
      expect(traceIds).toContain(trace1.id);
    });
  });

  describe("Count Query", () => {
    it("should return correct count with comment filter", async () => {
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace.id,
          content: "Test comment for counting",
          authorUserId: "user-1",
        },
      });

      const countResult = await caller.traces.countAll({
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
      });

      expect(typeof countResult.totalCount).toBe("number");
      expect(countResult.totalCount).toBeGreaterThan(0);
    });
  });

  describe("Metrics Query", () => {
    it("should filter metrics by comment count", async () => {
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      const trace2 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace1, trace2]);

      // Add 2 comments to trace1
      await prisma.comment.createMany({
        data: [
          {
            projectId,
            objectType: "TRACE",
            objectId: trace1.id,
            content: "First comment",
            authorUserId: "user-1",
          },
          {
            projectId,
            objectType: "TRACE",
            objectId: trace1.id,
            content: "Second comment",
            authorUserId: "user-1",
          },
        ],
      });

      // Add 1 comment to trace2
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace2.id,
          content: "Only one comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.traces.metrics({
        projectId,
        traceIds: [trace1.id, trace2.id],
        filter: [
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 2,
          },
        ],
      });

      // Should only return metrics for trace1 (has >= 2 comments)
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(trace1.id);
    });

    it("should filter metrics by comment content", async () => {
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      const trace2 = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace1, trace2]);

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace1.id,
          content: "Found a bug in authentication",
          authorUserId: "user-1",
        },
      });

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace2.id,
          content: "Everything works fine",
          authorUserId: "user-1",
        },
      });

      const result = await caller.traces.metrics({
        projectId,
        traceIds: [trace1.id, trace2.id],
        filter: [
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: "bug",
          },
        ],
      });

      // Should only return metrics for trace1 (has comment with "bug")
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(trace1.id);
    });
  });

  describe("Edge Cases", () => {
    it("should handle range filters correctly (>=1 AND <=100)", async () => {
      const uniqueId = randomUUID();
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace.id,
          content: `Test comment ${uniqueId}`,
          authorUserId: "user-1",
        },
      });

      const result = await caller.traces.all(
        createQueryParams([
          {
            type: "datetime",
            column: "timestamp",
            operator: ">=",
            value: new Date(Date.now() - 5000).toISOString(),
          },
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: uniqueId,
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

      const traceIds = result.traces.map((t) => t.id);
      expect(traceIds).toContain(trace.id);
    });

    it("should return empty results when no traces match range", async () => {
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace.id,
          content: "Test comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.traces.all(
        createQueryParams([
          {
            type: "datetime",
            column: "timestamp",
            operator: ">=",
            value: new Date(Date.now() - 5000).toISOString(),
          },
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 5, // No trace has 5+ comments
          },
        ]),
      );

      expect(result.traces).toEqual([]);
    });

    it("should handle special characters in search query", async () => {
      const uniqueId = randomUUID();
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
      });
      await createTracesCh([trace]);

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "TRACE",
          objectId: trace.id,
          content: `Error: (test & validation) failed! ${uniqueId}`,
          authorUserId: "user-1",
        },
      });

      // Should not throw SQL syntax error with special characters
      const result = await caller.traces.all(
        createQueryParams([
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: `test & validation) failed! ${uniqueId}`,
          },
        ]),
      );

      const traceIds = result.traces.map((t) => t.id);
      expect(traceIds).toContain(trace.id);
    });
  });
});
