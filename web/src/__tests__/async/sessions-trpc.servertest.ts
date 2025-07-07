/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
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

  describe("sessions.byId", () => {
    it("access private session", async () => {
      const sessionId = randomUUID();

      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      const trace = createTrace({
        project_id: projectId,
        session_id: sessionId,
      });

      const trace2 = createTrace({
        project_id: projectId,
        session_id: sessionId,
      });

      await createTracesCh([trace, trace2]);

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
      });

      const observation2 = createObservation({
        project_id: projectId,
        trace_id: trace2.id,
      });

      const observation3 = createObservation({
        project_id: projectId,
        trace_id: trace2.id,
      });

      await createObservationsCh([observation, observation2, observation3]);

      const sessionRes = await caller.sessions.byId({
        projectId,
        sessionId,
      });

      expect(sessionRes).toEqual({
        id: sessionId,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        projectId: projectId,
        environment: "default",
        bookmarked: false,
        public: false,
        traces: expect.arrayContaining([
          expect.objectContaining({
            id: trace.id,
            userId: trace.user_id,
            name: trace.name,
            timestamp: new Date(trace.timestamp),
            scores: [],
            environment: "default",
          }),
          expect.objectContaining({
            id: trace2.id,
            userId: trace2.user_id,
            name: trace2.name,
            timestamp: new Date(trace2.timestamp),
            scores: [],
            environment: "default",
          }),
        ]),
        totalCost: expect.any(Number),
        users: expect.arrayContaining([trace.user_id, trace2.user_id]),
      });
    });
  });

  describe("sessions.all", () => {
    it("should handle large usage filters correctly", async () => {
      // We expect that this doesn't throw an error due to a number overflow

      // When
      const sessions = await caller.sessions.all({
        projectId,
        orderBy: {
          column: "createdAt",
          order: "DESC",
        },
        filter: [
          {
            column: "Usage",
            operator: ">=",
            value: 3182169638,
            type: "number",
          },
        ],
      });

      // Then
      expect(sessions.sessions).toBeDefined();
    });
  });

  describe("sessions.countAll", () => {
    it("should count sessions", async () => {
      // Setup
      const sessionId = randomUUID();

      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      const trace = createTrace({
        project_id: projectId,
        session_id: sessionId,
      });
      await createTracesCh([trace]);

      // When
      const sessions = await caller.sessions.countAll({
        projectId,
        filter: null,
        orderBy: null,
      });

      // Then
      expect(sessions.totalCount).toBeGreaterThan(0);
    });
  });
});
