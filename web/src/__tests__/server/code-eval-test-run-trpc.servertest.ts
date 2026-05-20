import { randomUUID } from "node:crypto";
import { describe, expect, it, afterAll } from "vitest";
import type { Session } from "next-auth";
import {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
} from "@prisma/client";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { EvalTargetObject } from "@langfuse/shared";

const orgIds: string[] = [];

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

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
          aiFeaturesEnabled: true,
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              hasTraces: false,
              metadata: {},
              createdAt: project.createdAt.toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  orgIds.push(org.id);

  return { project, caller };
}

maybe("evals.testRunCodeEval", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: orgIds },
      },
    });
  });

  it("runs a saved code template against unsaved evaluator config without persisting eval state", async () => {
    const { project, caller } = await prepare();
    const observationId = randomUUID();
    const traceId = randomUUID();
    const savedSource = `
      export function evaluate(ctx) {
        const matched =
          ctx.observation.input === ${JSON.stringify(JSON.stringify({ question: "2+2" }))} &&
          ctx.observation.output === "4" &&
          ctx.observation.metadata.rubric === "math";

        return { scores: [{ value: matched ? 1 : 0, dataType: "BOOLEAN" }] };
      }
    `;

    const template = await prisma.evalTemplate.create({
      data: {
        projectId: project.id,
        name: "Saved code evaluator",
        version: 1,
        type: EvalTemplateType.CODE,
        prompt: null,
        outputDefinition: undefined,
        sourceCode: savedSource,
        sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
      },
    });

    await createEventsCh([
      createEvent({
        project_id: project.id,
        trace_id: traceId,
        span_id: observationId,
        id: observationId,
        input: JSON.stringify({ question: "2+2" }),
        output: "4",
        metadata_names: ["quality"],
        metadata_values: [JSON.stringify({ rubric: "math" })],
      }),
    ]);

    const jobConfigCountBefore = await prisma.jobConfiguration.count({
      where: { projectId: project.id },
    });
    const jobExecutionCountBefore = await prisma.jobExecution.count({
      where: { projectId: project.id },
    });

    const response = await caller.evals.testRunCodeEval({
      projectId: project.id,
      evalTemplateId: template.id,
      target: EvalTargetObject.EVENT,
      scoreName: "unsaved-score",
      observationId,
      mapping: [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: null,
        },
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: null,
        },
        {
          templateVariable: "observationMetadata",
          selectedColumnId: "metadata",
          jsonSelector: "$.quality",
        },
      ],
    });

    expect(response).toEqual({
      success: true,
      result: {
        scores: [
          {
            value: 1,
            dataType: "BOOLEAN",
          },
        ],
      },
      executionTraceId: expect.stringMatching(/^[0-9a-f]{32}$/),
    });

    await expect(
      prisma.jobConfiguration.count({ where: { projectId: project.id } }),
    ).resolves.toBe(jobConfigCountBefore);
    await expect(
      prisma.jobExecution.count({ where: { projectId: project.id } }),
    ).resolves.toBe(jobExecutionCountBefore);

    const scoreCount = await queryClickhouse<{ count: string }>({
      query: `SELECT count() as count FROM scores WHERE project_id = {projectId: String}`,
      params: { projectId: project.id },
      tags: {
        feature: "evals",
        type: "scores",
        kind: "testRunCodeEvalNoScores",
        projectId: project.id,
      },
    });

    expect(Number(scoreCount[0]?.count ?? 0)).toBe(0);
  });

  it("returns user-code dispatcher failures as structured failures", async () => {
    const { project, caller } = await prepare();
    const observationId = randomUUID();
    const template = await createCodeTemplate(
      project.id,
      `export function evaluate() {
        throw new Error("User code raised ValueError");
      }`,
    );

    await createEventsCh([
      createEvent({
        project_id: project.id,
        trace_id: randomUUID(),
        span_id: observationId,
        id: observationId,
      }),
    ]);

    const response = await caller.evals.testRunCodeEval({
      projectId: project.id,
      evalTemplateId: template.id,
      target: EvalTargetObject.EVENT,
      scoreName: "unsaved-score",
      observationId,
      mapping: [],
    });

    expect(response).toEqual({
      success: false,
      error: {
        code: "USER_CODE_ERROR",
        message: "User code raised ValueError",
      },
      executionTraceId: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it("persists an internal trace for the test run", async () => {
    const { project, caller } = await prepare();
    const observationId = randomUUID();
    const template = await createCodeTemplate(project.id);

    await createEventsCh([
      createEvent({
        project_id: project.id,
        trace_id: randomUUID(),
        span_id: observationId,
        id: observationId,
      }),
    ]);

    const response = await caller.evals.testRunCodeEval({
      projectId: project.id,
      evalTemplateId: template.id,
      target: EvalTargetObject.EVENT,
      scoreName: "unsaved-score",
      observationId,
      mapping: [],
    });

    if (!response.success) {
      throw new Error("Expected successful test run");
    }

    const executionTraceId = response.executionTraceId;

    const findTrace = async () => {
      const rows = await queryClickhouse<{
        environment: string;
        sourceCode: string;
      }>({
        query: `SELECT environment, metadata['code_eval_source_code'] as sourceCode FROM traces WHERE project_id = {projectId: String} AND id = {traceId: String} LIMIT 1`,
        params: { projectId: project.id, traceId: executionTraceId },
        tags: {
          feature: "evals",
          type: "traces",
          kind: "testRunCodeEvalTrace",
          projectId: project.id,
        },
      });
      return rows[0];
    };

    let trace = await findTrace();
    const deadline = Date.now() + 5_000;
    while (!trace && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      trace = await findTrace();
    }

    expect(trace).toBeDefined();
    expect(trace?.environment).toBe("langfuse-code-eval");
    expect(trace?.sourceCode).toBe(template.sourceCode);
  });

  it("does not return observations from other projects", async () => {
    const { project: callerProject, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const template = await createCodeTemplate(callerProject.id);

    const otherProjectObservationId = randomUUID();
    await createEventsCh([
      createEvent({
        project_id: otherProject.id,
        trace_id: randomUUID(),
        span_id: otherProjectObservationId,
        id: otherProjectObservationId,
      }),
    ]);

    await expect(
      caller.evals.testRunCodeEval({
        projectId: callerProject.id,
        evalTemplateId: template.id,
        target: EvalTargetObject.EVENT,
        scoreName: "unsaved-score",
        observationId: otherProjectObservationId,
        mapping: [],
      }),
    ).rejects.toThrow(/Observation not found/);
  });

  it("does not allow running templates owned by other projects", async () => {
    const { project: callerProject, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const observationId = randomUUID();

    const otherProjectTemplate = await createCodeTemplate(otherProject.id);

    await createEventsCh([
      createEvent({
        project_id: callerProject.id,
        trace_id: randomUUID(),
        span_id: observationId,
        id: observationId,
      }),
    ]);

    await expect(
      caller.evals.testRunCodeEval({
        projectId: callerProject.id,
        evalTemplateId: otherProjectTemplate.id,
        target: EvalTargetObject.EVENT,
        scoreName: "unsaved-score",
        observationId,
        mapping: [],
      }),
    ).rejects.toThrow(/Evaluator template not found/);
  });
});

async function createCodeTemplate(projectId: string, sourceCode?: string) {
  return prisma.evalTemplate.create({
    data: {
      projectId,
      name: `Saved code evaluator ${randomUUID()}`,
      version: 1,
      type: EvalTemplateType.CODE,
      prompt: null,
      outputDefinition: undefined,
      sourceCode:
        sourceCode ??
        "export function evaluate() { return { scores: [{ value: 1 }] }; }",
      sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
    },
  });
}
