/** @jest-environment node */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createTrace, createTracesCh } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("Sessions Comment Filtering", () => {
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
    orderBy: null as any,
    page: 0,
    limit: 10,
  });

  describe("Comment Count Filter", () => {
    it("should filter sessions with >= 2 comments", async () => {
      const sessionId1 = randomUUID();
      const sessionId2 = randomUUID();

      // Create sessions in PostgreSQL
      await prisma.traceSession.createMany({
        data: [
          { id: sessionId1, projectId },
          { id: sessionId2, projectId },
        ],
      });

      // Create traces with session IDs in ClickHouse
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId1,
      });
      const trace2 = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId2,
      });
      await createTracesCh([trace1, trace2]);

      // Add 2 comments to session1
      await prisma.comment.createMany({
        data: [
          {
            projectId,
            objectType: "SESSION",
            objectId: sessionId1,
            content: "First comment",
            authorUserId: "user-1",
          },
          {
            projectId,
            objectType: "SESSION",
            objectId: sessionId1,
            content: "Second comment",
            authorUserId: "user-1",
          },
        ],
      });

      // Add 1 comment to session2
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "SESSION",
          objectId: sessionId2,
          content: "Only one comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.sessions.all(
        createQueryParams([
          {
            type: "datetime",
            column: "createdAt",
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

      // Should get session1 (has >= 2 comments)
      const sessionIds = result.sessions.map((s) => s.id);
      expect(sessionIds).toContain(sessionId1);
      // session2 has only 1 comment, should not be included
      expect(sessionIds).not.toContain(sessionId2);
    });
  });

  describe("Comment Content Filter", () => {
    it("should filter sessions by comment content (contains)", async () => {
      const sessionId1 = randomUUID();
      const sessionId2 = randomUUID();

      // Create sessions in PostgreSQL
      await prisma.traceSession.createMany({
        data: [
          { id: sessionId1, projectId },
          { id: sessionId2, projectId },
        ],
      });

      // Create traces with session IDs in ClickHouse
      const trace1 = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId1,
      });
      const trace2 = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId2,
      });
      await createTracesCh([trace1, trace2]);

      // Add comments with different content
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "SESSION",
          objectId: sessionId1,
          content: "This session has a bug in the authentication flow",
          authorUserId: "user-1",
        },
      });

      await prisma.comment.create({
        data: {
          projectId,
          objectType: "SESSION",
          objectId: sessionId2,
          content: "Session works perfectly",
          authorUserId: "user-1",
        },
      });

      const result = await caller.sessions.all(
        createQueryParams([
          {
            type: "datetime",
            column: "createdAt",
            operator: ">=",
            value: new Date(Date.now() - 5000).toISOString(), // Last 5 seconds
          },
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: "bug",
          },
        ]),
      );

      const sessionIds = result.sessions.map((s) => s.id);
      expect(sessionIds).toContain(sessionId1);
      expect(sessionIds).not.toContain(sessionId2);
    });
  });

  describe("Combined Filters (AND Logic)", () => {
    it("should combine comment count + content filters", async () => {
      const sessionId = randomUUID();

      // Create session in PostgreSQL
      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      // Create trace with session ID in ClickHouse
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId,
      });
      await createTracesCh([trace]);

      // Add 2 comments with "bug" in content
      await prisma.comment.createMany({
        data: [
          {
            projectId,
            objectType: "SESSION",
            objectId: sessionId,
            content: "Found a bug here",
            authorUserId: "user-1",
          },
          {
            projectId,
            objectType: "SESSION",
            objectId: sessionId,
            content: "Confirmed the bug",
            authorUserId: "user-1",
          },
        ],
      });

      const result = await caller.sessions.all(
        createQueryParams([
          {
            type: "datetime",
            column: "createdAt",
            operator: ">=",
            value: new Date(Date.now() - 5000).toISOString(), // Last 5 seconds
          },
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

      const sessionIds = result.sessions.map((s) => s.id);
      expect(sessionIds).toContain(sessionId);
    });
  });

  describe("Count Query", () => {
    it("should return correct count with comment filter", async () => {
      const sessionId = randomUUID();

      // Create session in PostgreSQL
      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      // Create trace with session ID in ClickHouse
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId,
      });
      await createTracesCh([trace]);

      // Add comment
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "SESSION",
          objectId: sessionId,
          content: "Test comment for counting",
          authorUserId: "user-1",
        },
      });

      const countResult = await caller.sessions.countAll({
        projectId,
        filter: [
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 1,
          },
        ],
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
      const sessionId = randomUUID();

      // Create session in PostgreSQL
      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      // Create trace with session ID in ClickHouse
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId,
      });
      await createTracesCh([trace]);

      // Add comment
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "SESSION",
          objectId: sessionId,
          content: "Test comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.sessions.all(
        createQueryParams([
          {
            type: "datetime",
            column: "createdAt",
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

      const sessionIds = result.sessions.map((s) => s.id);
      expect(sessionIds).toContain(sessionId);
    });

    it("should return empty results when no sessions match range", async () => {
      const sessionId = randomUUID();

      // Create session in PostgreSQL
      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      // Create trace with session ID in ClickHouse
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId,
      });
      await createTracesCh([trace]);

      // Add comment
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "SESSION",
          objectId: sessionId,
          content: "Test comment",
          authorUserId: "user-1",
        },
      });

      const result = await caller.sessions.all(
        createQueryParams([
          {
            type: "number",
            column: "commentCount",
            operator: ">=",
            value: 5, // No session has 5+ comments
          },
        ]),
      );

      expect(result.sessions).toEqual([]);
    });

    it("should handle special characters in search query", async () => {
      const sessionId = randomUUID();

      // Create session in PostgreSQL
      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      // Create trace with session ID in ClickHouse
      const trace = createTrace({
        project_id: projectId,
        id: randomUUID(),
        session_id: sessionId,
      });
      await createTracesCh([trace]);

      // Add comment with special characters
      await prisma.comment.create({
        data: {
          projectId,
          objectType: "SESSION",
          objectId: sessionId,
          content: "Error: (test & validation) failed!",
          authorUserId: "user-1",
        },
      });

      // Should not throw SQL syntax error with special characters
      const result = await caller.sessions.all(
        createQueryParams([
          {
            type: "datetime",
            column: "createdAt",
            operator: ">=",
            value: new Date(Date.now() - 5000).toISOString(), // Last 5 seconds
          },
          {
            type: "string",
            column: "commentContent",
            operator: "contains",
            value: "test & validation",
          },
        ]),
      );

      const sessionIds = result.sessions.map((s) => s.id);
      expect(sessionIds).toContain(sessionId);
    });
  });
});
