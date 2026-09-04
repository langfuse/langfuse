import { EvalTargetObject, getCodeEvalVariableMapping } from "@langfuse/shared";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  ChatMessageRole,
  ChatMessageType,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import type * as SharedServer from "@langfuse/shared/src/server";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import type * as EnvModule from "@/src/env.mjs";
import type * as EvaluatorPreflightModule from "@/src/features/evals/server/evaluator-preflight";
import type * as TestEvaluatorModule from "@/src/features/evals/v2/server/evaluators/testEvaluator";
import type * as EvaluatorValidationModule from "@/src/features/evals/v2/server/evaluators/evaluatorValidation";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EvaluatorService } from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import {
  EvaluatorConfigurationError,
  EvaluatorModelConfigurationError,
  EvaluatorVersionConflictError,
} from "@/src/features/evals/v2/server/evaluators/evaluatorErrors";
import * as evaluatorRepository from "@/src/features/evals/v2/server/evaluators/evaluatorRepository";
import {
  type CreateEvaluatorInput,
  type NormalizedEvaluatorDefinition,
  EvaluatorVersionsSchema,
} from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";

const mocks = vi.hoisted(() => ({
  generateLangfuseAIText: vi.fn(),
  getRecentEvaluatorExecutionTraces: vi.fn(),
  getTotalCostByEvaluatorIds: vi.fn(),
  invalidateProjectEvalConfigCaches: vi.fn(),
  assertEvaluatorConfigurationValid: vi.fn(),
  getEvaluatorDefinitionPreflightError: vi.fn(),
  testEvaluator: vi.fn(),
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "events_only",
  } as {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: string | undefined;
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy" | "dual" | "events_only";
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  generateLangfuseAIText: mocks.generateLangfuseAIText,
  getRecentEvaluatorExecutionTraces: mocks.getRecentEvaluatorExecutionTraces,
  getTotalCostByEvaluatorIds: mocks.getTotalCostByEvaluatorIds,
  invalidateProjectEvalConfigCaches: mocks.invalidateProjectEvalConfigCaches,
}));

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    env: Object.assign(mocks.env, actual.env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
      LANGFUSE_MIGRATION_V4_WRITE_MODE: "events_only",
    }),
  };
});

vi.mock(
  "@/src/features/evals/v2/server/evaluators/testEvaluator",
  async (importOriginal) => ({
    ...(await importOriginal<typeof TestEvaluatorModule>()),
    testEvaluator: mocks.testEvaluator,
  }),
);

vi.mock(
  "@/src/features/evals/v2/server/evaluators/evaluatorValidation",
  async (importOriginal) => ({
    ...(await importOriginal<typeof EvaluatorValidationModule>()),
    assertEvaluatorConfigurationValid: mocks.assertEvaluatorConfigurationValid,
  }),
);

vi.mock(
  "@/src/features/evals/server/evaluator-preflight",
  async (importOriginal) => ({
    ...(await importOriginal<typeof EvaluatorPreflightModule>()),
    getEvaluatorDefinitionPreflightError:
      mocks.getEvaluatorDefinitionPreflightError,
  }),
);

const orgIds: string[] = [];
let orgId = "";
let projectId = "";
let otherProjectId = "";

const llmInput = (
  name: string,
): CreateEvaluatorInput & {
  definition: Extract<NormalizedEvaluatorDefinition, { type: "LLM_AS_JUDGE" }>;
} => ({
  projectId,
  name,
  description: "Initial description",
  definition: {
    type: "LLM_AS_JUDGE",
    promptMessages: [{ role: "user", content: "Judge {{output}}" }],
    provider: null,
    model: null,
    modelParams: null,
    vars: ["output"],
    variableMapping: [
      { templateVariable: "output", selectedColumnId: "output" },
    ],
    outputDefinition: {
      dataType: "NUMERIC",
      score: { description: "Quality" },
      reasoning: { description: "Reasoning" },
    },
  },
});

const createService = () => new EvaluatorService(prisma, async () => undefined);

// Langfuse AI availability resolves the model through the shared env, so drive
// it there rather than through the web env mock.
const originalSharedAiModel = {
  model: sharedEnv.LANGFUSE_AI_MODEL,
  smallModel: sharedEnv.LANGFUSE_AI_SMALL_MODEL,
  provider: sharedEnv.LANGFUSE_AI_PROVIDER,
  apiKey: sharedEnv.LANGFUSE_AI_API_KEY,
};

const setSharedAiModel = (params: {
  model: string | undefined;
  smallModel: string | undefined;
}) => {
  Object.assign(sharedEnv, {
    LANGFUSE_AI_PROVIDER: "bedrock",
    LANGFUSE_AI_API_KEY: undefined,
    LANGFUSE_AI_MODEL: params.model,
    LANGFUSE_AI_SMALL_MODEL: params.smallModel,
  });
};

beforeAll(async () => {
  const [first, second] = await Promise.all([
    createOrgProjectAndApiKey(),
    createOrgProjectAndApiKey(),
  ]);
  projectId = first.project.id;
  otherProjectId = second.project.id;
  orgId = first.org.id;
  orgIds.push(first.org.id, second.org.id);
  await prisma.organization.update({
    where: { id: first.org.id },
    data: { aiFeaturesEnabled: true },
  });
});

beforeEach(() => {
  mocks.generateLangfuseAIText.mockReset();
  mocks.getRecentEvaluatorExecutionTraces.mockReset();
  mocks.getTotalCostByEvaluatorIds.mockReset();
  mocks.invalidateProjectEvalConfigCaches.mockReset();
  mocks.assertEvaluatorConfigurationValid.mockReset();
  mocks.assertEvaluatorConfigurationValid.mockResolvedValue(undefined);
  mocks.getEvaluatorDefinitionPreflightError.mockReset();
  mocks.getEvaluatorDefinitionPreflightError.mockResolvedValue(null);
  mocks.testEvaluator.mockReset();
  mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
  mocks.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  setSharedAiModel({ model: "test-model", smallModel: "test-small-model" });
});

afterEach(async () => {
  await prisma.evaluationRule.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
  await prisma.evaluator.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
});

afterAll(async () => {
  Object.assign(sharedEnv, {
    LANGFUSE_AI_MODEL: originalSharedAiModel.model,
    LANGFUSE_AI_SMALL_MODEL: originalSharedAiModel.smallModel,
    LANGFUSE_AI_PROVIDER: originalSharedAiModel.provider,
    LANGFUSE_AI_API_KEY: originalSharedAiModel.apiKey,
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("EvaluatorService", () => {
  it("lists evaluators with pagination and project isolation", async () => {
    const service = createService();
    const [older, newer] = await Promise.all([
      service.create(llmInput("Older evaluator"), null),
      service.create(llmInput("Newer evaluator"), null),
      service.create(
        { ...llmInput("Other project evaluator"), projectId: otherProjectId },
        null,
      ),
    ]);
    await Promise.all([
      prisma.evaluator.update({
        where: { id: older.id },
        data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") },
      }),
      prisma.evaluator.update({
        where: { id: newer.id },
        data: { updatedAt: new Date("2026-01-02T00:00:00.000Z") },
      }),
    ]);

    await expect(
      service.list({ projectId, page: 1, limit: 1 }),
    ).resolves.toMatchObject({
      evaluators: [{ id: newer.id }],
      totalItems: 2,
    });
    await expect(
      service.list({ projectId, page: 2, limit: 1 }),
    ).resolves.toMatchObject({
      evaluators: [{ id: older.id }],
      totalItems: 2,
    });
  });

  it("creates an evaluator with version one and rejects cross-project reads", async () => {
    const service = createService();
    const evaluatorId = crypto.randomUUID();
    const input = llmInput("Create evaluator");
    input.definition.promptMessages = [
      { role: "system", content: "Judge carefully" },
      { role: "user", content: "Judge {{output}}" },
    ];
    const created = await service.create({ ...input, evaluatorId }, null);

    expect(created.versions[0]).not.toHaveProperty("prompt");
    expect(created).toMatchObject({
      id: evaluatorId,
      projectId,
      name: "Create evaluator",
      versions: [
        expect.objectContaining({
          version: 1,
          promptMessages: input.definition.promptMessages,
        }),
      ],
    });
    const fetched = await service.get(projectId, created.id);
    expect(fetched.versions[0]).not.toHaveProperty("prompt");
    expect(fetched).toMatchObject({
      id: created.id,
      versions: [
        expect.objectContaining({
          promptMessages: input.definition.promptMessages,
        }),
      ],
    });

    await prisma.evaluatorVersion.updateMany({
      where: { evaluatorId: created.id },
      data: { promptMessages: Prisma.DbNull },
    });
    await expect(service.get(projectId, created.id)).resolves.toMatchObject({
      versions: [
        expect.objectContaining({
          promptMessages: [
            {
              role: "user",
              content: input.definition.promptMessages
                .map(({ content }) => content)
                .join("\n\n"),
            },
          ],
        }),
      ],
    });

    await prisma.evaluatorVersion.updateMany({
      where: { evaluatorId: created.id },
      data: { prompt: "   ", promptMessages: Prisma.DbNull },
    });
    await expect(service.get(projectId, created.id)).resolves.toMatchObject({
      versions: [
        expect.objectContaining({
          promptMessages: [{ role: "user", content: "No prompt provided" }],
        }),
      ],
    });

    await expect(service.get(otherProjectId, created.id)).rejects.toThrow(
      "Evaluator not found",
    );
  });

  it("writes the canonical mapping when creating a code evaluator", async () => {
    const created = await createService().create(
      {
        projectId,
        name: "Code evaluator",
        description: null,
        definition: {
          type: "CODE",
          sourceCode: "return { score: 1 };",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      },
      null,
    );

    expect(created.versions[0]?.variableMapping).toEqual(
      getCodeEvalVariableMapping(),
    );
  });

  it("returns the filter from the first assigned rule", async () => {
    const service = createService();
    const created = await service.create(llmInput("Assigned evaluator"), null);
    const olderFilter = [
      {
        column: "name",
        type: "string",
        operator: "contains",
        value: "older",
      },
    ];
    const newerFilter = [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ];

    await Promise.all([
      prisma.evaluationRule.create({
        data: {
          projectId,
          name: "Older assigned rule",
          status: "ACTIVE",
          targetObject: EvalTargetObject.EVENT,
          filter: olderFilter,
          sampling: 1,
          delay: 0,
          assignments: {
            create: {
              projectId,
              evaluatorId: created.id,
              createdAt: new Date("2025-01-01T00:00:00.000Z"),
            },
          },
        },
      }),
      prisma.evaluationRule.create({
        data: {
          projectId,
          name: "Newer assigned rule",
          status: "ACTIVE",
          targetObject: EvalTargetObject.EVENT,
          filter: newerFilter,
          sampling: 1,
          delay: 0,
          assignments: {
            create: {
              projectId,
              evaluatorId: created.id,
              createdAt: new Date("2025-01-02T00:00:00.000Z"),
            },
          },
        },
      }),
    ]);

    await expect(
      service.getWithSampleFilter(projectId, created.id),
    ).resolves.toMatchObject({
      id: created.id,
      sampleFilter: newerFilter,
    });
  });

  it("does not return a sample filter without an assigned rule", async () => {
    const service = createService();
    const created = await service.create(
      llmInput("Unassigned evaluator"),
      null,
    );

    await expect(
      service.getWithSampleFilter(projectId, created.id),
    ).resolves.toMatchObject({
      id: created.id,
      sampleFilter: undefined,
    });
  });

  it("does not return a legacy rule filter unsupported by observation queries", async () => {
    const service = createService();
    const created = await service.create(
      llmInput("Legacy filter evaluator"),
      null,
    );
    await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Legacy assigned rule",
        status: "ACTIVE",
        targetObject: EvalTargetObject.EVENT,
        filter: [
          {
            column: "Dataset",
            type: "stringOptions",
            operator: "any of",
            value: ["dataset-1"],
          },
        ],
        sampling: 1,
        delay: 0,
        assignments: {
          create: {
            projectId,
            evaluatorId: created.id,
          },
        },
      },
    });

    await expect(
      service.getWithSampleFilter(projectId, created.id),
    ).resolves.toMatchObject({
      id: created.id,
      sampleFilter: undefined,
    });
  });

  it("audits successful evaluator mutations", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = new EvaluatorService(prisma, audit);
    const input = llmInput("Audited evaluator");

    const created = await service.create(input, null);
    await service.update(
      {
        ...input,
        evaluatorId: created.id,
        name: "Updated audited evaluator",
      },
      null,
    );
    await service.delete(projectId, created.id);

    expect(audit.mock.calls.map(([event]) => event)).toEqual([
      { action: "create", projectId, evaluatorId: created.id },
      { action: "update", projectId, evaluatorId: created.id },
      { action: "delete", projectId, evaluatorId: created.id },
    ]);
  });

  it("does not persist evaluator changes when configuration validation fails", async () => {
    const service = createService();
    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorConfigurationError("Invalid evaluator configuration"),
    );

    await expect(
      service.create(llmInput("Invalid create"), null),
    ).rejects.toThrow("Invalid evaluator configuration");
    await expect(
      prisma.evaluator.count({ where: { projectId, name: "Invalid create" } }),
    ).resolves.toBe(0);

    const evaluator = await service.create(llmInput("Invalid update"), null);
    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorConfigurationError("Invalid evaluator configuration"),
    );
    await expect(
      service.update(
        {
          ...llmInput("Renamed before invalid update"),
          evaluatorId: evaluator.id,
        },
        null,
      ),
    ).rejects.toThrow("Invalid evaluator configuration");
    await expect(service.get(projectId, evaluator.id)).resolves.toMatchObject({
      name: "Invalid update",
      versions: [expect.objectContaining({ version: 1 })],
    });
  });

  it("stores an evaluator with an invalid model configuration as blocked", async () => {
    const service = createService();
    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorModelConfigurationError(
        'No valid LLM model found for evaluator "Invalid model". No default evaluation model configured.',
      ),
    );

    const evaluator = await service.create(llmInput("Invalid model"), null);

    expect(evaluator).toMatchObject({
      name: "Invalid model",
      blockedAt: expect.any(Date),
      blockReason: "DEFAULT_EVAL_MODEL_MISSING",
      blockMessage:
        "Evaluator paused: no default evaluation model is configured. Set a default evaluation model or update the evaluator template, then reactivate it.",
      versions: [expect.objectContaining({ version: 1 })],
    });

    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorModelConfigurationError(
        'No valid LLM model found for evaluator "Invalid model". The configured model is unavailable.',
      ),
    );
    const updated = await service.update(
      {
        ...llmInput("Invalid model"),
        evaluatorId: evaluator.id,
        definition: {
          ...llmInput("Invalid model").definition,
          provider: "openai",
          model: "missing-model",
        },
      },
      null,
    );

    expect(updated).toMatchObject({
      blockedAt: expect.any(Date),
      blockReason: "EVAL_MODEL_CONFIG_INVALID",
      blockMessage:
        "Evaluator paused: no valid evaluation model is configured. Update the evaluator template or default evaluation model, then reactivate it.",
      versions: [expect.objectContaining({ version: 2 })],
    });

    mocks.invalidateProjectEvalConfigCaches.mockClear();
    const recovered = await service.patch(
      {
        projectId,
        evaluatorId: evaluator.id,
        definition: {
          ...llmInput("Invalid model").definition,
          provider: "openai",
          model: "available-model",
        },
      },
      null,
    );
    expect(recovered).toMatchObject({
      id: evaluator.id,
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
      versions: [expect.objectContaining({ version: 3 })],
    });
    expect(mocks.invalidateProjectEvalConfigCaches).toHaveBeenCalledWith(
      projectId,
    );

    await prisma.evaluator.update({
      where: { id: evaluator.id },
      data: {
        blockedAt: new Date(),
        blockReason: "LLM_CONNECTION_AUTH_INVALID",
        blockMessage: "Authentication failed",
      },
    });
    const stillBlocked = await service.patch(
      {
        projectId,
        evaluatorId: evaluator.id,
        definition: {
          ...llmInput("Invalid model").definition,
          promptMessages: [
            { role: "user", content: "Updated prompt: {{output}}" },
          ],
          provider: "openai",
          model: "available-model",
        },
      },
      null,
    );
    expect(stillBlocked).toMatchObject({
      blockedAt: expect.any(Date),
      blockReason: "LLM_CONNECTION_AUTH_INVALID",
      blockMessage: "Authentication failed",
    });

    await prisma.evaluator.update({
      where: { id: evaluator.id },
      data: {
        blockedAt: new Date(),
        blockReason: null,
        blockMessage: "Legacy pause without a reason",
      },
    });
    const legacyPause = await service.patch(
      {
        projectId,
        evaluatorId: evaluator.id,
        definition: {
          ...llmInput("Invalid model").definition,
          promptMessages: [
            { role: "user", content: "Another updated prompt: {{output}}" },
          ],
          provider: "openai",
          model: "available-model",
        },
      },
      null,
    );
    expect(legacyPause).toMatchObject({
      blockedAt: expect.any(Date),
      blockReason: null,
      blockMessage: "Legacy pause without a reason",
    });
  });

  it("reactivates a blocked evaluator only after its model test succeeds", async () => {
    const service = createService();
    mocks.assertEvaluatorConfigurationValid.mockRejectedValueOnce(
      new EvaluatorModelConfigurationError("No default model configured"),
    );
    const evaluator = await service.create(llmInput("Reactivate model"), null);

    mocks.getEvaluatorDefinitionPreflightError.mockResolvedValueOnce(
      "The model test failed",
    );
    await expect(
      service.reactivate({ projectId, evaluatorId: evaluator.id }),
    ).rejects.toThrow("The model test failed");
    await expect(service.get(projectId, evaluator.id)).resolves.toMatchObject({
      blockedAt: expect.any(Date),
      blockReason: "DEFAULT_EVAL_MODEL_MISSING",
    });

    await expect(
      service.reactivate({ projectId, evaluatorId: evaluator.id }),
    ).resolves.toMatchObject({
      id: evaluator.id,
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
    });
    expect(mocks.getEvaluatorDefinitionPreflightError).toHaveBeenCalledTimes(2);
  });

  it("creates and updates an evaluator through name-based upsert", async () => {
    const service = createService();
    const input = llmInput("Legacy evaluator");

    const created = await service.upsertByName(input, null);
    const updated = await service.upsertByName(input, null);

    expect(created).toMatchObject({
      action: "create",
      evaluator: { name: input.name, versions: [{ version: 1 }] },
    });
    expect(updated).toMatchObject({
      action: "update",
      evaluator: { id: created.evaluator.id, versions: [{ version: 2 }] },
    });
  });

  it("updates metadata without a version and appends a version for definition changes", async () => {
    const service = createService();
    const input = llmInput("Version decisions");
    const created = await service.create(input, null);

    const metadataUpdate = await service.update(
      {
        ...input,
        evaluatorId: created.id,
        name: "Renamed evaluator",
        description: "Changed only metadata",
      },
      null,
    );
    expect(metadataUpdate.versions).toHaveLength(1);
    expect(metadataUpdate).toMatchObject({
      name: "Renamed evaluator",
      description: "Changed only metadata",
    });

    const definitionUpdate = await service.update(
      {
        ...input,
        evaluatorId: created.id,
        name: "Renamed evaluator",
        description: "Changed only metadata",
        definition: {
          ...input.definition,
          promptMessages: [
            {
              role: "user" as const,
              content: "Judge {{output}} strictly",
            },
          ],
        },
      },
      null,
    );
    expect(definitionUpdate.versions.map((version) => version.version)).toEqual(
      [2],
    );
    const firstPage = await service.listVersions({
      projectId,
      evaluatorId: created.id,
      limit: 1,
    });
    expect(firstPage).toEqual({
      data: [expect.objectContaining({ version: 2 })],
      nextCursor: "eyJ2IjoxLCJ2ZXJzaW9uIjoyfQ",
    });
    const cursor = EvaluatorVersionsSchema.parse({
      projectId,
      evaluatorId: created.id,
      cursor: firstPage.nextCursor,
      limit: 1,
    }).cursor;
    await expect(
      service.listVersions({
        projectId,
        evaluatorId: created.id,
        cursor,
        limit: 1,
      }),
    ).resolves.toEqual({
      data: [expect.objectContaining({ version: 1 })],
      nextCursor: undefined,
    });
    await expect(
      service.listVersions({
        projectId: otherProjectId,
        evaluatorId: created.id,
        limit: 1,
      }),
    ).rejects.toThrow("Evaluator not found");
  });

  it("changes the prompt without validating or rewriting rule mappings", async () => {
    const service = createService();
    const input = llmInput("Assigned evaluator update");
    const created = await service.create(input, null);
    const staleMapping = [
      { templateVariable: "output", selectedColumnId: "output" },
      {
        templateVariable: "item_metadata",
        selectedColumnId: "experimentItemMetadata",
      },
    ];
    const rule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Assigned rule",
        status: "ACTIVE",
        targetObject: EvalTargetObject.EVENT,
        filter: [],
        sampling: 1,
        delay: 0,
        assignments: {
          create: {
            projectId,
            evaluatorId: created.id,
            variableMapping: staleMapping as Prisma.InputJsonValue,
          },
        },
      },
    });

    // The override maps a variable the new prompt drops and misses one it adds.
    await expect(
      service.update(
        {
          ...input,
          evaluatorId: created.id,
          definition: {
            ...input.definition,
            promptMessages: [
              {
                role: "user",
                content: "Judge {{input}} and {{output}}",
              },
            ],
            vars: ["input", "output"],
            variableMapping: [
              { templateVariable: "input", selectedColumnId: "input" },
              { templateVariable: "output", selectedColumnId: "output" },
            ],
          },
        },
        null,
      ),
    ).resolves.toMatchObject({
      versions: [expect.objectContaining({ version: 2 })],
    });

    const assignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: rule.id, evaluatorId: created.id },
      });
    expect(assignment.variableMapping).toEqual(staleMapping);
  });

  it("returns a retryable conflict when an evaluator version advances concurrently", async () => {
    const service = createService();
    const input = llmInput("Concurrent version update");
    const created = await service.create(input, null);

    await expect(
      prisma.$transaction(async (tx) => {
        await evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: created.id,
          version: 2,
          definition: {
            ...input.definition,
            prompt: "Judge {{output}}",
          },
          createdByUserId: null,
        });
        await evaluatorRepository.appendEvaluatorVersion({
          tx,
          evaluatorId: created.id,
          version: 2,
          definition: {
            ...input.definition,
            prompt: "Judge {{output}}",
          },
          createdByUserId: null,
        });
      }),
    ).rejects.toBeInstanceOf(EvaluatorVersionConflictError);

    await expect(
      prisma.evaluatorVersion.count({ where: { evaluatorId: created.id } }),
    ).resolves.toBe(1);
  });

  it("tests an evaluator without persisting an evaluator or version", async () => {
    mocks.testEvaluator.mockResolvedValue({ score: 1 });
    const service = createService();
    const evaluator = await service.create(llmInput("Test evaluator"), null);
    const newEvaluatorId = crypto.randomUUID();
    const observation = {
      observationId: "test-observation-id",
      traceId: "test-trace-id",
      startTime: new Date("2026-08-11T00:00:00.000Z"),
      shouldReadFromObservationsTable: false,
    };
    const before = await prisma.evaluatorVersion.count({
      where: { evaluator: { projectId } },
    });

    await expect(
      service.testEvaluator({
        orgId,
        projectId,
        evaluatorId: newEvaluatorId,
        definition: llmInput("Test evaluator").definition,
        ...observation,
      }),
    ).resolves.toEqual({ score: 1 });

    await expect(
      service.testEvaluator({
        orgId,
        projectId,
        evaluatorId: evaluator.id,
        definition: llmInput("Test evaluator").definition,
        ...observation,
      }),
    ).resolves.toEqual({ score: 1 });

    await expect(
      service.testEvaluator({
        orgId,
        projectId,
        definition: llmInput("Test evaluator").definition,
        ...observation,
      }),
    ).resolves.toEqual({ score: 1 });

    expect(mocks.testEvaluator).toHaveBeenCalledTimes(3);
    expect(mocks.testEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        evaluatorId: newEvaluatorId,
        includeEvaluatorLink: false,
        ...observation,
      }),
    );
    expect(mocks.testEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        evaluatorId: evaluator.id,
        includeEvaluatorLink: true,
        ...observation,
      }),
    );
    expect(mocks.testEvaluator).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        orgId,
        evaluatorId: expect.any(String),
        includeEvaluatorLink: false,
        ...observation,
      }),
    );
    await expect(
      prisma.evaluatorVersion.count({ where: { evaluator: { projectId } } }),
    ).resolves.toBe(before);

    await expect(
      service.testEvaluator({
        orgId,
        projectId: otherProjectId,
        evaluatorId: evaluator.id,
        definition: llmInput("Test evaluator").definition,
        ...observation,
      }),
    ).rejects.toThrow("Evaluator not found");
  });

  it("tests the latest version of a saved evaluator", async () => {
    mocks.testEvaluator.mockResolvedValue({ score: 1 });
    const service = createService();
    const evaluator = await service.create(llmInput("Saved evaluator"), null);
    const latestDefinition = {
      ...llmInput("Saved evaluator").definition,
      promptMessages: [
        { role: "user" as const, content: "Judge the latest {{output}}" },
      ],
    };
    await service.update(
      {
        ...llmInput("Saved evaluator"),
        evaluatorId: evaluator.id,
        definition: latestDefinition,
      },
      null,
    );

    const observation = {
      observationId: "test-observation-id",
      traceId: "test-trace-id",
      startTime: new Date("2026-08-11T00:00:00.000Z"),
      shouldReadFromObservationsTable: false,
    };

    await expect(
      service.testEvaluator({
        orgId,
        projectId,
        evaluatorId: evaluator.id,
        ...observation,
      }),
    ).resolves.toEqual({ score: 1 });

    expect(mocks.testEvaluator).toHaveBeenCalledWith({
      orgId,
      projectId,
      evaluatorId: evaluator.id,
      definition: latestDefinition,
      includeEvaluatorLink: true,
      ...observation,
    });
  });

  it("suggests a safe name and silently returns null when unavailable", async () => {
    mocks.generateLangfuseAIText
      .mockResolvedValueOnce('  "Concise quality judge"  ')
      .mockResolvedValueOnce(
        "I can't provide personalized advice about alcohol consumption limits, as this depends on individual factors",
      )
      .mockRejectedValueOnce(new Error("AI unavailable"));
    const service = createService();
    const definition = {
      type: "LLM_AS_JUDGE" as const,
      promptMessages: [{ role: "user" as const, content: "Judge quality" }],
    };

    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBe("Concise quality judge");
    expect(mocks.generateLangfuseAIText).toHaveBeenCalledOnce();
    expect(mocks.generateLangfuseAIText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: ChatMessageRole.System,
            type: ChatMessageType.System,
            content: expect.stringMatching(
              /used as the score name.*return exactly "Custom Evaluator"/,
            ),
          }),
          expect.objectContaining({
            role: ChatMessageRole.User,
            type: ChatMessageType.User,
          }),
        ],
        model: "test-small-model",
      }),
    );
    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBe("Custom Evaluator");
    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBeNull();

    mocks.generateLangfuseAIText.mockClear();
    setSharedAiModel({ model: "test-model", smallModel: undefined });
    mocks.generateLangfuseAIText.mockResolvedValueOnce("Main model fallback");
    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBe("Main model fallback");
    expect(mocks.generateLangfuseAIText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "test-model" }),
    );

    mocks.generateLangfuseAIText.mockClear();
    setSharedAiModel({ model: undefined, smallModel: undefined });
    await expect(
      service.suggestName({ projectId, userId: null, definition }),
    ).resolves.toBeNull();
    expect(mocks.generateLangfuseAIText).not.toHaveBeenCalled();

    setSharedAiModel({ model: "test-model", smallModel: undefined });
    await expect(
      service.suggestName({
        projectId: otherProjectId,
        userId: null,
        definition,
      }),
    ).resolves.toBeNull();
    expect(mocks.generateLangfuseAIText).not.toHaveBeenCalled();
  });

  it("suggests only an evaluator description", async () => {
    mocks.generateLangfuseAIText.mockResolvedValueOnce(
      "  Scores response quality when reviewing model outputs.  ",
    );
    const service = createService();
    const definition = {
      type: "LLM_AS_JUDGE" as const,
      promptMessages: [{ role: "user" as const, content: "Judge quality" }],
    };

    await expect(
      service.suggestDescription({ projectId, userId: null, definition }),
    ).resolves.toBe("Scores response quality when reviewing model outputs.");
    expect(mocks.generateLangfuseAIText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringMatching(
              /Describe the evaluator.*one concise sentence/,
            ),
          }),
          expect.anything(),
        ],
      }),
    );
  });

  it("deletes only the evaluator in the selected project", async () => {
    const service = createService();
    const created = await service.create(llmInput("Delete evaluator"), null);

    await expect(service.delete(otherProjectId, created.id)).rejects.toThrow(
      "Evaluator not found",
    );
    await service.delete(projectId, created.id);
    await expect(service.get(projectId, created.id)).rejects.toThrow(
      "Evaluator not found",
    );
  });

  it("deletes an evaluator and its rule assignments", async () => {
    const service = createService();
    const created = await service.create(llmInput("Assigned evaluator"), null);
    const rule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "Assigned rule",
        status: "ACTIVE",
        targetObject: "EVENT",
        filter: [],
        sampling: 1,
        delay: 0,
        assignments: {
          create: {
            projectId,
            evaluatorId: created.id,
            variableMapping: Prisma.DbNull,
          },
        },
      },
    });

    await expect(
      prisma.evaluationRuleEvaluatorAssignment.count({
        where: { projectId, evaluatorId: created.id },
      }),
    ).resolves.toBe(1);

    await expect(
      service.delete(projectId, created.id),
    ).resolves.toBeUndefined();
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.count({
        where: { evaluationRuleId: rule.id, evaluatorId: created.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.evaluationRule.findUnique({
        where: { id: rule.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "INACTIVE" });
  });

  it("deletes an explicit evaluator selection", async () => {
    const service = createService();
    const [first, second, otherProjectEvaluator] = await Promise.all([
      service.create(llmInput("First selected evaluator"), null),
      service.create(llmInput("Second selected evaluator"), null),
      service.create(
        { ...llmInput("Other project evaluator"), projectId: otherProjectId },
        null,
      ),
    ]);
    const deletedIds = await service.deleteMany({
      projectId,
      evaluatorIds: [first.id, second.id],
    });

    expect(deletedIds).toEqual([first.id, second.id]);
    await expect(
      prisma.evaluator.count({
        where: { id: { in: [first.id, second.id] } },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.evaluator.findUnique({ where: { id: otherProjectEvaluator.id } }),
    ).resolves.not.toBeNull();
  });

  it("deletes all search matches without crossing project boundaries", async () => {
    const service = createService();
    const [firstMatch, secondMatch, keep, otherProjectMatch] =
      await Promise.all([
        service.create(llmInput("Bulk match one"), null),
        service.create(llmInput("Bulk match two"), null),
        service.create(llmInput("Keep evaluator"), null),
        service.create(
          { ...llmInput("Bulk match other"), projectId: otherProjectId },
          null,
        ),
      ]);
    const deletedIds = await service.deleteMany({
      projectId,
      isBatchAction: true,
      search: "bulk match",
    });

    expect(new Set(deletedIds)).toEqual(
      new Set([firstMatch.id, secondMatch.id]),
    );
    await expect(
      prisma.evaluator.findMany({
        where: { id: { in: [keep.id, otherProjectMatch.id] } },
        select: { id: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([{ id: keep.id }, { id: otherProjectMatch.id }]),
    );
  });

  it("returns recent traces by evaluator id", async () => {
    const service = createService();
    const evaluatorIds = [crypto.randomUUID(), crypto.randomUUID()];
    mocks.getRecentEvaluatorExecutionTraces.mockResolvedValue([
      ...[7, 6, 5, 4, 3].map((day) => ({
        id: `first-${day}`,
        evaluatorId: evaluatorIds[0],
        level: "WARNING",
        timestamp: new Date(`2026-08-0${day}T00:00:00.000Z`),
      })),
      ...[4, 3, 2, 1].map((day) => ({
        id: `second-${day}`,
        evaluatorId: evaluatorIds[1],
        level: "DEFAULT",
        timestamp: new Date(`2026-08-0${day}T00:00:00.000Z`),
      })),
    ]);

    const result = await service.listRecent({ projectId, evaluatorIds });

    expect(mocks.getRecentEvaluatorExecutionTraces).toHaveBeenCalledWith(
      projectId,
      evaluatorIds,
    );
    expect(result[evaluatorIds[0]]?.map(({ id }) => id)).toEqual([
      "first-7",
      "first-6",
      "first-5",
      "first-4",
      "first-3",
    ]);
    expect(result[evaluatorIds[1]]?.map(({ id }) => id)).toEqual([
      "second-4",
      "second-3",
      "second-2",
      "second-1",
    ]);
  });

  it("returns total costs by evaluator id", async () => {
    const service = createService();
    const evaluatorIds = [crypto.randomUUID(), crypto.randomUUID()];
    mocks.getTotalCostByEvaluatorIds.mockResolvedValue([
      { evaluatorId: evaluatorIds[0], totalCost: 1.5 },
      { evaluatorId: evaluatorIds[1], totalCost: 2.5 },
    ]);

    await expect(
      service.getTotalCosts({ projectId, evaluatorIds }),
    ).resolves.toEqual({
      [evaluatorIds[0]]: 1.5,
      [evaluatorIds[1]]: 2.5,
    });
    expect(mocks.getTotalCostByEvaluatorIds).toHaveBeenCalledWith(
      projectId,
      evaluatorIds,
    );
  });
});
