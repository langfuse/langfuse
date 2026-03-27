/** @jest-environment node */

import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  createBooleanEvalOutputDefinition,
  createCategoricalEvalOutputDefinition,
  createNumericEvalOutputDefinition,
  EvalTargetObject,
  EvaluatorBlockReason,
} from "@langfuse/shared";
import type { Session } from "next-auth";

const __orgIds: string[] = [];

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

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  __orgIds.push(org.id);

  return { project, org, session, ctx, caller };
}

describe("evals trpc", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  describe("evals.allConfigs", () => {
    it("should retrieve all evaluator configurations without execution status counts", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig1 = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
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
          projectId: project.id,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "COMPLETED",
          projectId: project.id,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "ERROR",
          projectId: project.id,
        },
      });

      const evalJobConfig2 = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      const response = await caller.evals.allConfigs({
        projectId: project.id,
        filter: [],
        orderBy: {
          column: "createdAt",
          order: "DESC",
        },
        limit: 10,
        page: 0,
      });

      expect(response).toEqual({
        configs: expect.arrayContaining([
          expect.objectContaining({
            id: evalJobConfig1.id,
            displayStatus: "ACTIVE",
          }),
          expect.objectContaining({
            id: evalJobConfig2.id,
            displayStatus: "ACTIVE",
          }),
        ]),
        totalCount: expect.any(Number),
      });
    });

    it("should order evaluators by display status as active, paused, inactive", async () => {
      const { project, caller } = await prepare();

      const inactiveEvaluator = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "inactive-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "INACTIVE",
          createdAt: new Date("2024-03-03T00:00:00.000Z"),
        },
      });

      const pausedEvaluator = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "paused-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          blockedAt: new Date("2024-03-04T00:00:00.000Z"),
          blockReason: EvaluatorBlockReason.EVAL_MODEL_CONFIG_INVALID,
          blockMessage: "Paused for verification",
          createdAt: new Date("2024-02-02T00:00:00.000Z"),
        },
      });

      const activeEvaluator = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "active-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      });

      const response = await caller.evals.allConfigs({
        projectId: project.id,
        filter: [],
        orderBy: {
          column: "status",
          order: "ASC",
        },
        limit: 10,
        page: 0,
      });

      expect(
        response.configs.map((config) => ({
          id: config.id,
          displayStatus: config.displayStatus,
        })),
      ).toEqual([
        { id: activeEvaluator.id, displayStatus: "ACTIVE" },
        { id: pausedEvaluator.id, displayStatus: "PAUSED" },
        { id: inactiveEvaluator.id, displayStatus: "INACTIVE" },
      ]);
    });
  });

  describe("evals.templateNames", () => {
    it("should return the latest template versions with output definitions", async () => {
      const { project, caller } = await prepare();

      await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "numeric-template",
          version: 1,
          prompt: "Score this response",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      const latestNumericTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "numeric-template",
          version: 2,
          prompt: "Score this response again",
          outputDefinition: createNumericEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "How good",
          }),
        },
      });

      const categoricalTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "categorical-template",
          version: 1,
          prompt: "Classify this response",
          outputDefinition: createCategoricalEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription: "Classification",
            categories: ["correct", "incorrect"],
          }),
        },
      });

      const booleanTemplate = await prisma.evalTemplate.create({
        data: {
          projectId: project.id,
          name: "boolean-template",
          version: 1,
          prompt: "Judge whether the response satisfies the criteria",
          outputDefinition: createBooleanEvalOutputDefinition({
            reasoningDescription: "Why",
            scoreDescription:
              "Return true if the response satisfies the criteria, otherwise false",
          }),
        },
      });

      const response = await caller.evals.templateNames({
        projectId: project.id,
        page: 0,
        limit: 10,
      });

      expect(response.templates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            latestId: latestNumericTemplate.id,
            name: "numeric-template",
            outputDefinition: expect.objectContaining({
              dataType: "NUMERIC",
            }),
          }),
          expect.objectContaining({
            latestId: categoricalTemplate.id,
            name: "categorical-template",
            outputDefinition: expect.objectContaining({
              dataType: "CATEGORICAL",
            }),
          }),
          expect.objectContaining({
            latestId: booleanTemplate.id,
            name: "boolean-template",
            outputDefinition: expect.objectContaining({
              dataType: "BOOLEAN",
            }),
          }),
        ]),
      );
    });
  });

  describe("evals.jobExecutionCountsByEvaluatorIds", () => {
    it("should lazily retrieve execution status counts grouped by evaluator id", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig1 = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
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
          projectId: project.id,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "COMPLETED",
          projectId: project.id,
        },
      });

      await prisma.jobExecution.create({
        data: {
          jobConfigurationId: evalJobConfig1.id,
          status: "ERROR",
          projectId: project.id,
        },
      });

      const evalJobConfig2 = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score-2",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
        },
      });

      const response = await caller.evals.jobExecutionCountsByEvaluatorIds({
        projectId: project.id,
        evaluatorIds: [evalJobConfig1.id, evalJobConfig2.id],
      });

      expect(response).toEqual({
        [evalJobConfig1.id]: expect.arrayContaining([
          expect.objectContaining({
            status: "PENDING",
            count: 1,
          }),
          expect.objectContaining({
            status: "COMPLETED",
            count: 1,
          }),
          expect.objectContaining({
            status: "ERROR",
            count: 1,
          }),
        ]),
        [evalJobConfig2.id]: [],
      });
    });
  });

  describe("evals.updateConfig", () => {
    it("should update an evaluator configuration", async () => {
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["NEW"],
        },
      });

      const response = await caller.evals.updateEvalJob({
        projectId: project.id,
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
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["EXISTING"],
        },
      });

      expect(
        caller.evals.updateEvalJob({
          projectId: project.id,
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
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["EXISTING"],
        },
      });

      expect(
        caller.evals.updateEvalJob({
          projectId: project.id,
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
      const { project, caller } = await prepare();

      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
          variableMapping: [],
          sampling: 1,
          delay: 0,
          status: "ACTIVE",
          timeScope: ["EXISTING", "NEW"],
        },
      });

      const response = await caller.evals.updateEvalJob({
        projectId: project.id,
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
      const { project, caller } = await prepare();

      // Create a job to delete
      const evalJobConfig = await prisma.jobConfiguration.create({
        data: {
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
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
            projectId: project.id,
          },
        }),
        prisma.jobExecution.create({
          data: {
            jobConfigurationId: evalJobConfig.id,
            status: "PENDING",
            projectId: project.id,
          },
        }),
        prisma.jobExecution.create({
          data: {
            jobConfigurationId: evalJobConfig.id,
            status: "ERROR",
            projectId: project.id,
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
        projectId: project.id,
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
      const { project, caller } = await prepare();

      await expect(
        caller.evals.deleteEvalJob({
          projectId: project.id,
          evalConfigId: "non-existent-id",
        }),
      ).rejects.toThrow("Job not found");
    });

    it("should throw error when user lacks evalJob:CUD access scope", async () => {
      const { project, session } = await prepare();

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
          projectId: project.id,
          jobType: "EVAL",
          scoreName: "test-score",
          filter: [],
          targetObject: EvalTargetObject.TRACE,
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
          projectId: project.id,
          evalConfigId: evalJobConfig.id,
        }),
      ).rejects.toThrow("User does not have access to this resource or action");
    });
  });

  // TODO: moved to LFE-4573
  // describe("evals.deleteEvalTemplate", () => {
  //   it("should successfully delete an eval template", async () => {
  //     const { project, caller } = await prepare();

  //     // Create a template to delete
  //     const evalTemplate = await prisma.evalTemplate.create({
  //       data: {
  //         projectId: project.id,
  //         name: "test-template",
  //         version: 1,
  //         prompt: "test prompt",
  //         model: "test-model",
  //         modelParams: {},
  //         vars: [],
  //         outputDefinition: {
  //           score: "test-score",
  //           reasoning: "test-reasoning",
  //         },
  //         provider: "test-provider",
  //       },
  //     });

  //     // Delete the template
  //     await caller.evals.deleteEvalTemplate({
  //       projectId: project.id,
  //       evalTemplateId: evalTemplate.id,
  //     });

  //     // Verify template is deleted
  //     const deletedTemplate = await prisma.evalTemplate.findUnique({
  //       where: {
  //         id: evalTemplate.id,
  //       },
  //     });
  //     expect(deletedTemplate).toBeNull();
  //   });

  //   it("should set evalTemplateId to null for associated eval jobs when template is deleted", async () => {
  //     const { project, caller } = await prepare();

  //     // Create a template
  //     const evalTemplate = await prisma.evalTemplate.create({
  //       data: {
  //         projectId: project.id,
  //         name: "test-template",
  //         version: 1,
  //         prompt: "test prompt",
  //         model: "test-model",
  //         modelParams: {},
  //         vars: [],
  //         outputDefinition: {
  //           score: "test-score",
  //           reasoning: "test-reasoning",
  //         },
  //         provider: "test-provider",
  //       },
  //     });

  //     // Create an eval job linked to this template
  //     const evalJob = await prisma.jobConfiguration.create({
  //       data: {
  //         projectId: project.id,
  //         jobType: "EVAL",
  //         scoreName: "test-score",
  //         filter: [],
  //         targetObject: EvalTargetObject.TRACE,
  //         variableMapping: [],
  //         sampling: 1,
  //         delay: 0,
  //         status: "ACTIVE",
  //         timeScope: ["NEW"],
  //         evalTemplateId: evalTemplate.id,
  //       },
  //     });

  //     // Delete the template
  //     await caller.evals.deleteEvalTemplate({
  //       projectId: project.id,
  //       evalTemplateId: evalTemplate.id,
  //     });

  //     // Verify template is deleted
  //     const deletedTemplate = await prisma.evalTemplate.findUnique({
  //       where: {
  //         id: evalTemplate.id,
  //       },
  //     });
  //     expect(deletedTemplate).toBeNull();

  //     // Verify eval job still exists but has evalTemplateId set to null
  //     const updatedJob = await prisma.jobConfiguration.findUnique({
  //       where: {
  //         id: evalJob.id,
  //       },
  //     });
  //     expect(updatedJob).not.toBeNull();
  //     expect(updatedJob?.evalTemplateId).toBeNull();
  //   });

  //   it("should throw error when trying to delete non-existent eval template", async () => {
  //     const { project, caller } = await prepare();

  //     await expect(
  //       caller.evals.deleteEvalTemplate({
  //         projectId: project.id,
  //         evalTemplateId: "non-existent-id",
  //       }),
  //     ).rejects.toThrow("Template not found");
  //   });

  //   it("should throw error when user lacks evalTemplate:CUD access scope", async () => {
  //     const { project, session } = await prepare();

  //     // Create a session with limited permissions
  //     const limitedSession: Session = {
  //       ...session,
  //       user: {
  //         id: session.user!.id,
  //         name: session.user!.name,
  //         canCreateOrganizations: session.user!.canCreateOrganizations,
  //         admin: false,
  //         featureFlags: session.user!.featureFlags,
  //         organizations: [
  //           {
  //             ...session.user!.organizations[0],
  //             role: "MEMBER",
  //             projects: [
  //               {
  //                 ...session.user!.organizations[0].projects[0],
  //                 role: "VIEWER", // VIEWER role doesn't have evalTemplate:CUD scope
  //               },
  //             ],
  //           },
  //         ],
  //       },
  //       expires: session.expires,
  //       environment: session.environment,
  //     };
  //     const limitedCtx = createInnerTRPCContext({ session: limitedSession });
  //     const limitedCaller = appRouter.createCaller({ ...limitedCtx, prisma });

  //     // Create a template
  //     const evalTemplate = await prisma.evalTemplate.create({
  //       data: {
  //         projectId: project.id,
  //         name: "test-template",
  //         version: 1,
  //         prompt: "test prompt",
  //         model: "test-model",
  //         modelParams: {},
  //         vars: [],
  //         outputDefinition: {
  //           score: "test-score",
  //           reasoning: "test-reasoning",
  //         },
  //         provider: "test-provider",
  //       },
  //     });

  //     // Attempt to delete with limited permissions
  //     await expect(
  //       limitedCaller.evals.deleteEvalTemplate({
  //         projectId: project.id,
  //         evalTemplateId: evalTemplate.id,
  //       }),
  //     ).rejects.toThrow("User does not have access to this resource or action");
  //   });
  // });
});
