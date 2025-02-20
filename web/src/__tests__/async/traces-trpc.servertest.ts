/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createTrace, createTracesCh } from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("traces trpc", () => {
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

  describe("traces.byId", () => {
    it("access private trace", async () => {
      const trace = createTrace({
        project_id: projectId,
      });

      await createTracesCh([trace]);

      const traceRes = await caller.traces.byId({
        projectId,
        traceId: trace.id,
      });

      expect(traceRes?.id).toEqual(trace.id);
      expect(traceRes?.projectId).toEqual(projectId);
      expect(traceRes?.name).toEqual(trace.name);
      expect(traceRes?.timestamp).toEqual(new Date(trace.timestamp));
      expect(traceRes?.tags).toEqual(trace.tags);
      expect(traceRes?.input).toEqual(trace.input);
      expect(traceRes?.output).toEqual(trace.output);
      expect(traceRes?.userId).toEqual(trace.user_id);
      expect(traceRes?.sessionId).toEqual(trace.session_id);
    });

    it("access public trace", async () => {
      const differentProjectId = randomUUID();
      const trace = createTrace({
        project_id: differentProjectId,
        public: true,
      });

      await createTracesCh([trace]);

      const traceRes = await caller.traces.byId({
        projectId: differentProjectId,
        traceId: trace.id,
      });

      expect(traceRes?.id).toEqual(trace.id);
      expect(traceRes?.projectId).toEqual(differentProjectId);
      expect(traceRes?.name).toEqual(trace.name);
      expect(traceRes?.timestamp).toEqual(new Date(trace.timestamp));
    });

    it("access trace without any authentication", async () => {
      const unAuthedSession = createInnerTRPCContext({ session: null });
      const unAuthedCaller = appRouter.createCaller({
        ...unAuthedSession,
        prisma,
      });

      const trace = createTrace({
        project_id: projectId,
        public: true,
      });

      await createTracesCh([trace]);

      const traceRes = await unAuthedCaller.traces.byId({
        projectId,
        traceId: trace.id,
      });

      expect(traceRes?.id).toEqual(trace.id);
      expect(traceRes?.projectId).toEqual(projectId);
      expect(traceRes?.name).toEqual(trace.name);
      expect(traceRes?.timestamp).toEqual(new Date(trace.timestamp));
    });
  });
});
