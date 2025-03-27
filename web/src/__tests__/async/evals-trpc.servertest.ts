/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("evals trpc", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  beforeEach(async () => {
    await pruneDatabase();
    await prisma.jobExecution.deleteMany();
    await prisma.jobConfiguration.deleteMany();
    await prisma.evalTemplate.deleteMany();
  });

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

  describe("evals.updateConfig", () => {
    it("should update an evaluator configuration", async () => {
      const evalJobConfig = await prisma.jobConfiguration.create({
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
          timeScope: ["NEW"],
        },
      });

      const response = await caller.evals.updateEvalJob({
        projectId,
        evalConfigId: evalJobConfig.id,
        config: {
          status: "INACTIVE",
        },
      });

      expect(response.id).toEqual(evalJobConfig.id);
      expect(response.status).toEqual("INACTIVE");
      expect(response.timeScope).toEqual(["NEW"]);

      const updatedJob = await prisma.jobConfiguration.findUnique({
        where: {
          id: evalJobConfig.id,
        },
      });

      expect(updatedJob).not.toBeNull();
      expect(updatedJob?.id).toEqual(evalJobConfig.id);
      expect(updatedJob?.status).toEqual("INACTIVE");
      expect(updatedJob?.timeScope).toEqual(["NEW"]);
    });

    it("when the evaluator ran on existing traces, time scope cannot be changed to NEW only", async () => {
      const evalJobConfig = await prisma.jobConfiguration.create({
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
          timeScope: ["EXISTING"],
        },
      });

      expect(
        caller.evals.updateEvalJob({
          projectId,
          evalConfigId: evalJobConfig.id,
          config: {
            timeScope: ["NEW"],
          },
        }),
      ).rejects.toThrow(
        "The evaluator ran on existing traces already. This cannot be changed anymore.",
      );
    });

    it("when the evaluator ran on existing traces, it cannot be deactivated", async () => {
      const evalJobConfig = await prisma.jobConfiguration.create({
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
          timeScope: ["EXISTING"],
        },
      });

      expect(
        caller.evals.updateEvalJob({
          projectId,
          evalConfigId: evalJobConfig.id,
          config: {
            status: "INACTIVE",
          },
        }),
      ).rejects.toThrow(
        "The evaluator is running on existing traces only and cannot be deactivated.",
      );
    });

    it("when the evaluator ran on existing traces, it can be deactivated if it should also run on new traces", async () => {
      const evalJobConfig = await prisma.jobConfiguration.create({
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
          timeScope: ["EXISTING", "NEW"],
        },
      });

      const response = await caller.evals.updateEvalJob({
        projectId,
        evalConfigId: evalJobConfig.id,
        config: {
          status: "INACTIVE",
        },
      });

      expect(response.id).toEqual(evalJobConfig.id);
      expect(response.status).toEqual("INACTIVE");
      expect(response.timeScope).toEqual(["EXISTING", "NEW"]);

      const updatedJob = await prisma.jobConfiguration.findUnique({
        where: {
          id: evalJobConfig.id,
        },
      });

      expect(updatedJob).not.toBeNull();
      expect(updatedJob?.id).toEqual(evalJobConfig.id);
      expect(updatedJob?.status).toEqual("INACTIVE");
      expect(updatedJob?.timeScope).toEqual(["EXISTING", "NEW"]);
    });
  });

  describe("evals.deleteEvalJob", () => {
    it("should successfully delete an eval job", async () => {
      // Create a job to delete
      const evalJobConfig = await prisma.jobConfiguration.create({
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
          timeScope: ["NEW"],
        },
      });

      // Create multiple job executions with different statuses
      await Promise.all([
        prisma.jobExecution.create({
          data: {
            jobConfigurationId: evalJobConfig.id,
            status: "COMPLETED",
            projectId,
          },
        }),
        prisma.jobExecution.create({
          data: {
            jobConfigurationId: evalJobConfig.id,
            status: "PENDING",
            projectId,
          },
        }),
        prisma.jobExecution.create({
          data: {
            jobConfigurationId: evalJobConfig.id,
            status: "ERROR",
            projectId,
            error: "Test error",
          },
        }),
      ]);

      // Verify job executions exist before deletion
      const beforeJobExecutions = await prisma.jobExecution.findMany({
        where: {
          jobConfigurationId: evalJobConfig.id,
        },
      });
      expect(beforeJobExecutions).toHaveLength(3);

      // Delete the job
      await caller.evals.deleteEvalJob({
        projectId,
        evalConfigId: evalJobConfig.id,
      });

      // Verify job is deleted
      const deletedJob = await prisma.jobConfiguration.findUnique({
        where: {
          id: evalJobConfig.id,
        },
      });
      expect(deletedJob).toBeNull();

      // Verify all job executions are deleted (cascade)
      const afterJobExecutions = await prisma.jobExecution.findMany({
        where: {
          jobConfigurationId: evalJobConfig.id,
        },
      });
      expect(afterJobExecutions).toHaveLength(0);
    });

    it("should throw error when trying to delete non-existent eval job", async () => {
      await expect(
        caller.evals.deleteEvalJob({
          projectId,
          evalConfigId: "non-existent-id",
        }),
      ).rejects.toThrow("Job not found");
    });

    it("should throw error when user lacks evalJob:CUD access scope", async () => {
      // Create a session with limited permissions
      const limitedSession: Session = {
        ...session,
        user: {
          id: session.user!.id,
          name: session.user!.name,
          canCreateOrganizations: session.user!.canCreateOrganizations,
          admin: false,
          featureFlags: session.user!.featureFlags,
          organizations: [
            {
              ...session.user!.organizations[0],
              role: "MEMBER",
              projects: [
                {
                  ...session.user!.organizations[0].projects[0],
                  role: "VIEWER", // VIEWER role doesn't have evalTemplate:CUD scope
                },
              ],
            },
          ],
        },
        expires: session.expires,
        environment: session.environment,
      };
      const limitedCtx = createInnerTRPCContext({ session: limitedSession });
      const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

      // Create a job
      const evalJobConfig = await prisma.jobConfiguration.create({
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
          timeScope: ["NEW"],
        },
      });

      // Attempt to delete with limited permissions
      await expect(
        limitedCaller.evals.deleteEvalJob({
          projectId,
          evalConfigId: evalJobConfig.id,
        }),
      ).rejects.toThrow("User does not have access to this resource or action");
    });
  });

  describe("evals.deleteEvalTemplate", () => {
    it("should successfully delete an eval template", async () => {
      // Create a template to delete
      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId,
          name: "test-template",
          version: 1,
          prompt: "test prompt",
          model: "test-model",
          modelParams: {},
          vars: [],
          outputSchema: {
            score: "test-score",
            reasoning: "test-reasoning",
          },
          provider: "test-provider",
        },
      });

      // Delete the template
      await caller.evals.deleteEvalTemplate({
        projectId,
        evalTemplateId: evalTemplate.id,
      });

      // Verify template is deleted
      const deletedTemplate = await prisma.evalTemplate.findUnique({
        where: {
          id: evalTemplate.id,
        },
      });
      expect(deletedTemplate).toBeNull();
    });

    it("should set evalTemplateId to null for associated eval jobs when template is deleted", async () => {
      // Create a template
      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId,
          name: "test-template",
          version: 1,
          prompt: "test prompt",
          model: "test-model",
          modelParams: {},
          vars: [],
          outputSchema: {
            score: "test-score",
            reasoning: "test-reasoning",
          },
          provider: "test-provider",
        },
      });

      // Create an eval job linked to this template
      const evalJob = await prisma.jobConfiguration.create({
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
          timeScope: ["NEW"],
          evalTemplateId: evalTemplate.id,
        },
      });

      // Delete the template
      await caller.evals.deleteEvalTemplate({
        projectId,
        evalTemplateId: evalTemplate.id,
      });

      // Verify template is deleted
      const deletedTemplate = await prisma.evalTemplate.findUnique({
        where: {
          id: evalTemplate.id,
        },
      });
      expect(deletedTemplate).toBeNull();

      // Verify eval job still exists but has evalTemplateId set to null
      const updatedJob = await prisma.jobConfiguration.findUnique({
        where: {
          id: evalJob.id,
        },
      });
      expect(updatedJob).not.toBeNull();
      expect(updatedJob?.evalTemplateId).toBeNull();
    });

    it("should throw error when trying to delete non-existent eval template", async () => {
      await expect(
        caller.evals.deleteEvalTemplate({
          projectId,
          evalTemplateId: "non-existent-id",
        }),
      ).rejects.toThrow("Template not found");
    });

    it("should throw error when user lacks evalTemplate:CUD access scope", async () => {
      // Create a session with limited permissions
      const limitedSession: Session = {
        ...session,
        user: {
          id: session.user!.id,
          name: session.user!.name,
          canCreateOrganizations: session.user!.canCreateOrganizations,
          admin: false,
          featureFlags: session.user!.featureFlags,
          organizations: [
            {
              ...session.user!.organizations[0],
              role: "MEMBER",
              projects: [
                {
                  ...session.user!.organizations[0].projects[0],
                  role: "VIEWER", // VIEWER role doesn't have evalTemplate:CUD scope
                },
              ],
            },
          ],
        },
        expires: session.expires,
        environment: session.environment,
      };
      const limitedCtx = createInnerTRPCContext({ session: limitedSession });
      const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

      // Create a template
      const evalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId,
          name: "test-template",
          version: 1,
          prompt: "test prompt",
          model: "test-model",
          modelParams: {},
          vars: [],
          outputSchema: {
            score: "test-score",
            reasoning: "test-reasoning",
          },
          provider: "test-provider",
        },
      });

      // Attempt to delete with limited permissions
      await expect(
        limitedCaller.evals.deleteEvalTemplate({
          projectId,
          evalTemplateId: evalTemplate.id,
        }),
      ).rejects.toThrow("User does not have access to this resource or action");
    });
  });
});
