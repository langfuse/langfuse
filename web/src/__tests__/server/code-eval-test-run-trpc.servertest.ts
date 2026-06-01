import { randomUUID } from "node:crypto";
import { describe, expect, it, afterAll, vi } from "vitest";
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
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { EvalTargetObject } from "@langfuse/shared";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_LANGFUSE_CODE_EVAL_ENABLED = "true";
  process.env.LANGFUSE_CODE_EVAL_DISPATCHER = "insecure-local";
});

const orgIds: string[] = [];

const maybe =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
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
          aiTelemetryEnabled: true,
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
    const startTime = new Date();
    const savedSource = `
      function evaluate(ctx) {
        const matched =
          ctx.observation.input.question === "2+2" &&
          ctx.observation.output === "4" &&
          ctx.observation.metadata.rubric === "math";

        return { scores: [{ name: "saved-test-score", value: matched, dataType: "BOOLEAN" }] };
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
        start_time: startTime.getTime() * 1000,
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
      traceId,
      startTime,
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
          templateVariable: "metadata",
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
            name: "saved-test-score",
            value: 1,
            dataType: "BOOLEAN",
          },
        ],
      },
      executionTraceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      executionTraceFromTimestamp: expect.any(Date),
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

  it("runs against legacy observations when events table evals are disabled", async () => {
    const { project, caller } = await prepare();
    const observationId = randomUUID();
    const traceId = randomUUID();
    const startTime = new Date();
    const template = await createCodeTemplate(
      project.id,
      `
        function evaluate(ctx) {
          const matched =
            ctx.observation.input === "legacy input" &&
            ctx.observation.output === "legacy output" &&
            ctx.observation.metadata === "legacy";

          return { scores: [{ name: "legacy-observation-score", value: matched ? 1 : 0, dataType: "BOOLEAN" }] };
        }
      `,
    );

    await createTracesCh([
      createTrace({
        id: traceId,
        project_id: project.id,
        timestamp: startTime.getTime(),
      }),
    ]);
    await createObservationsCh([
      createObservation({
        id: observationId,
        trace_id: traceId,
        project_id: project.id,
        start_time: startTime.getTime(),
        input: "legacy input",
        output: "legacy output",
        metadata: { quality: "legacy" },
      }),
    ]);

    const mutableEnv = env as unknown as {
      LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN: "true" | "false";
    };
    const originalEventsTableFlagsFlag =
      mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN;

    try {
      mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "false";

      const response = await caller.evals.testRunCodeEval({
        projectId: project.id,
        evalTemplateId: template.id,
        target: EvalTargetObject.EVENT,
        scoreName: "unsaved-score",
        observationId,
        traceId,
        startTime,
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
            templateVariable: "metadata",
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
              name: "legacy-observation-score",
              value: 1,
              dataType: "BOOLEAN",
            },
          ],
        },
        executionTraceId: expect.stringMatching(/^[0-9a-f]{32}$/),
        executionTraceFromTimestamp: expect.any(Date),
      });
    } finally {
      mutableEnv.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN =
        originalEventsTableFlagsFlag;
    }
  });

  it("returns user-code dispatcher failures as structured failures", async () => {
    const { project, caller } = await prepare();
    const observationId = randomUUID();
    const traceId = randomUUID();
    const startTime = new Date();
    const template = await createCodeTemplate(
      project.id,
      `function evaluate() {
        throw new Error("User code raised ValueError");
      }`,
    );

    await createEventsCh([
      createEvent({
        project_id: project.id,
        trace_id: traceId,
        span_id: observationId,
        id: observationId,
        start_time: startTime.getTime() * 1000,
      }),
    ]);

    const response = await caller.evals.testRunCodeEval({
      projectId: project.id,
      evalTemplateId: template.id,
      target: EvalTargetObject.EVENT,
      scoreName: "unsaved-score",
      observationId,
      traceId,
      startTime,
      mapping: [],
    });

    expect(response).toEqual({
      success: false,
      error: {
        code: "USER_CODE_ERROR",
        message: "User code raised ValueError",
      },
      executionTraceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      executionTraceFromTimestamp: expect.any(Date),
    });
  });

  it("returns invalid evaluator results for test-run debugging", async () => {
    const { project, caller } = await prepare();
    const observationId = randomUUID();
    const traceId = randomUUID();
    const startTime = new Date();
    const template = await createCodeTemplate(
      project.id,
      `function evaluate() {
        return { score: 1 };
      }`,
    );

    await createEventsCh([
      createEvent({
        project_id: project.id,
        trace_id: traceId,
        span_id: observationId,
        id: observationId,
        start_time: startTime.getTime() * 1000,
      }),
    ]);

    const response = await caller.evals.testRunCodeEval({
      projectId: project.id,
      evalTemplateId: template.id,
      target: EvalTargetObject.EVENT,
      scoreName: "unsaved-score",
      observationId,
      traceId,
      startTime,
      mapping: [],
    });

    expect(response).toEqual({
      success: false,
      error: {
        code: "INVALID_RESULT",
        message: expect.stringContaining(
          "The evaluator returned an invalid result.",
        ),
        returnedResult: { score: 1 },
      },
      executionTraceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      executionTraceFromTimestamp: expect.any(Date),
    });
  });

  it("passes experiment context to test runs", async () => {
    const { project, caller } = await prepare();
    const observationId = randomUUID();
    const traceId = randomUUID();
    const startTime = new Date();
    const expectedOutput = "expected answer";
    const template = await createCodeTemplate(
      project.id,
      `
        function evaluate(ctx) {
          if (!ctx.experiment) {
            throw new Error("missing experiment context");
          }

          const matched =
            ctx.observation.output === ctx.experiment.itemExpectedOutput &&
            ctx.experiment.itemMetadata.difficulty === "easy";

          return { scores: [{ name: "experiment-test-score", value: matched, dataType: "BOOLEAN" }] };
        }
      `,
    );

    await createEventsCh([
      createEvent({
        project_id: project.id,
        trace_id: traceId,
        span_id: observationId,
        id: observationId,
        start_time: startTime.getTime() * 1000,
        output: expectedOutput,
        experiment_id: randomUUID(),
        experiment_item_expected_output: expectedOutput,
        experiment_item_metadata_names: ["difficulty"],
        experiment_item_metadata_values: ["easy"],
      }),
    ]);

    const response = await caller.evals.testRunCodeEval({
      projectId: project.id,
      evalTemplateId: template.id,
      target: EvalTargetObject.EXPERIMENT,
      scoreName: "experiment-score",
      observationId,
      traceId,
      startTime,
      mapping: [
        {
          templateVariable: "output",
          selectedColumnId: "output",
          jsonSelector: null,
        },
        {
          templateVariable: "experimentItemExpectedOutput",
          selectedColumnId: "experimentItemExpectedOutput",
          jsonSelector: null,
        },
        {
          templateVariable: "experimentItemMetadata",
          selectedColumnId: "experimentItemMetadata",
          jsonSelector: null,
        },
      ],
    });

    expect(response).toEqual({
      success: true,
      result: {
        scores: [
          {
            name: "experiment-test-score",
            value: 1,
            dataType: "BOOLEAN",
          },
        ],
      },
      executionTraceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      executionTraceFromTimestamp: expect.any(Date),
    });
  });

  it("persists an internal trace for the test run", async () => {
    const { project, caller } = await prepare();
    const observationId = randomUUID();
    const traceId = randomUUID();
    const startTime = new Date();
    const template = await createCodeTemplate(project.id);

    await createEventsCh([
      createEvent({
        project_id: project.id,
        trace_id: traceId,
        span_id: observationId,
        id: observationId,
        start_time: startTime.getTime() * 1000,
      }),
    ]);

    const response = await caller.evals.testRunCodeEval({
      projectId: project.id,
      evalTemplateId: template.id,
      target: EvalTargetObject.EVENT,
      scoreName: "unsaved-score",
      observationId,
      traceId,
      startTime,
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
    const otherProjectTraceId = randomUUID();
    const otherProjectStartTime = new Date();
    await createEventsCh([
      createEvent({
        project_id: otherProject.id,
        trace_id: otherProjectTraceId,
        span_id: otherProjectObservationId,
        id: otherProjectObservationId,
        start_time: otherProjectStartTime.getTime() * 1000,
      }),
    ]);

    await expect(
      caller.evals.testRunCodeEval({
        projectId: callerProject.id,
        evalTemplateId: template.id,
        target: EvalTargetObject.EVENT,
        scoreName: "unsaved-score",
        observationId: otherProjectObservationId,
        traceId: otherProjectTraceId,
        startTime: otherProjectStartTime,
        mapping: [],
      }),
    ).rejects.toThrow(/Observation not found/);
  });

  it("does not allow running templates owned by other projects", async () => {
    const { project: callerProject, caller } = await prepare();
    const { project: otherProject } = await prepare();
    const observationId = randomUUID();
    const traceId = randomUUID();
    const startTime = new Date();

    const otherProjectTemplate = await createCodeTemplate(otherProject.id);

    await createEventsCh([
      createEvent({
        project_id: callerProject.id,
        trace_id: traceId,
        span_id: observationId,
        id: observationId,
        start_time: startTime.getTime() * 1000,
      }),
    ]);

    await expect(
      caller.evals.testRunCodeEval({
        projectId: callerProject.id,
        evalTemplateId: otherProjectTemplate.id,
        target: EvalTargetObject.EVENT,
        scoreName: "unsaved-score",
        observationId,
        traceId,
        startTime,
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
        'function evaluate() { return { scores: [{ name: "test-score", value: 1 }] }; }',
      sourceCodeLanguage: EvalTemplateSourceCodeLanguage.TYPESCRIPT,
    },
  });
}
