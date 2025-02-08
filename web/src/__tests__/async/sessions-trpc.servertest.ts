/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
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

describe("traces trps", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  beforeEach(async () => await pruneDatabase());

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

      console.log(sessionRes);
    });
  });
});
