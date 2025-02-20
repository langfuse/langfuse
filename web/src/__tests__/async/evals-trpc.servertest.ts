/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("evals trpc", () => {
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

  describe("evals.allConfigs", () => {
    it("should retrieve all evaluator configurations with execution status counts", async () => {
      const evalJobConfig1 = await prisma.jobConfiguration.create({
        data: {
          projectId,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: "trace",
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "PENDING",
          projectId,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "COMPLETED",
          projectId,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "ERROR",
          projectId,
        },
      });

      const evalJobConfig2 = await prisma.jobConfiguration.create({
        data: {
          projectId,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: "trace",
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      const response = await caller.evals.allConfigs({
        projectId,
        limit: 10,
        page: 0,
      });

      expect(response).toEqual({
        configs: expect.arrayContaining([
          expect.objectContaining({
            id: evalJobConfig1.id,
            jobExecutionsByState: expect.arrayContaining([
              expect.objectContaining({
                status: "PENDING",
                _count: 1,
                jobConfigurationId: evalJobConfig1.id,
              }),
              expect.objectContaining({
                status: "COMPLETED",
                _count: 1,
                jobConfigurationId: evalJobConfig1.id,
              }),
              expect.objectContaining({
                status: "ERROR",
                _count: 1,
                jobConfigurationId: evalJobConfig1.id,
              }),
            ]),
          }),
          expect.objectContaining({
            id: evalJobConfig2.id,
            jobExecutionsByState: expect.arrayContaining([]),
          }),
        ]),
        totalCount: expect.any(Number),
      });
    });
  });
});
