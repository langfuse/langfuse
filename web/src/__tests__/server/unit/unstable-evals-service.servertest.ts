import type { Mock } from "vitest";

const mockEvalTemplateCreate = vi.fn();
const mockEvalTemplateFindMany = vi.fn();
const mockJobConfigurationFindMany = vi.fn();
const mockJobConfigurationUpdate = vi.fn();

vi.mock(
  "../../../features/evals/server/unstable-public-api/validation",
  async () => {
    const actual = await vi.importActual(
      "../../../features/evals/server/unstable-public-api/validation",
    );

    return {
      ...actual,
      assertEvaluatorDefinitionCanRunForPublicApi: vi.fn(),
    };
  },
);

vi.mock("../../../features/evals/server/unstable-public-api/queries", () => ({
  countActiveEvaluationRules: vi.fn(),
  findPublicEvaluatorTemplateOrThrow: vi.fn(),
  countEvaluationRulesForEvaluator: vi.fn(),
  countEvaluationRulesForEvaluatorIds: vi.fn(),
  listPublicEvaluatorTemplates: vi.fn(),
  loadEvaluatorForEvaluationRule: vi.fn(),
  findPublicEvaluationRuleOrThrow: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  invalidateProjectEvalConfigCaches: vi.fn(),
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn().mockResolvedValue(undefined),
    }),
  },
  logger: {
    debug: vi.fn(),
  },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      clientVersion: string;

      constructor(
        message: string,
        {
          code,
          clientVersion,
        }: {
          code: string;
          clientVersion: string;
        },
      ) {
        super(message);
        this.code = code;
        this.clientVersion = clientVersion;
      }
    },
  },
  prisma: {
    $transaction: vi.fn(),
    dataset: {
      findMany: vi.fn(),
    },
    jobConfiguration: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  createNumericEvalOutputDefinition,
  EvalTargetObject,
  JobConfigState,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createUnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";
import {
  createPublicEvaluationRule,
  updatePublicEvaluationRule,
} from "@/src/features/evals/server/unstable-public-api/evaluation-rule-service";
import { createPublicEvaluator } from "@/src/features/evals/server/unstable-public-api/evaluator-service";
import * as queryModule from "@/src/features/evals/server/unstable-public-api/queries";
import * as validationModule from "@/src/features/evals/server/unstable-public-api/validation";

const numericOutputDefinition = createNumericEvalOutputDefinition({
  reasoningDescription: "Why the score was assigned",
  scoreDescription: "A score between 0 and 1",
});

const projectTemplate = {
  id: "tmpl_project_v2",
  projectId: "project_123",
  name: "Answer correctness",
  version: 2,
  prompt: "Judge {{input}}",
  partner: null,
  provider: null,
  model: null,
  modelParams: null,
  vars: ["input"],
  outputDefinition: numericOutputDefinition,
  createdAt: new Date("2026-03-30T08:00:00.000Z"),
  updatedAt: new Date("2026-03-30T08:00:00.000Z"),
};

const managedTemplate = {
  id: "tmpl_managed",
  projectId: null,
  name: "Answer correctness",
  version: 7,
  prompt: "Judge {{input}}",
  partner: "ragas",
  provider: null,
  model: null,
  modelParams: null,
  vars: ["input"],
  outputDefinition: numericOutputDefinition,
  createdAt: new Date("2026-03-30T08:00:00.000Z"),
  updatedAt: new Date("2026-03-30T08:00:00.000Z"),
};

const mockedPrisma = prisma as unknown as {
  $transaction: Mock;
  dataset: {
    findMany: Mock;
  };
  jobConfiguration: {
    findFirst: Mock;
    create: Mock;
    update: Mock;
  };
};
const mockAssertEvaluatorDefinitionCanRunForPublicApi = vi.mocked(
  validationModule.assertEvaluatorDefinitionCanRunForPublicApi,
);
const mockLoadEvaluatorForEvaluationRule = vi.mocked(
  queryModule.loadEvaluatorForEvaluationRule,
);
const mockCountActiveEvaluationRules = vi.mocked(
  queryModule.countActiveEvaluationRules,
);
const mockFindPublicEvaluationRuleOrThrow = vi.mocked(
  queryModule.findPublicEvaluationRuleOrThrow,
);
const mockCountEvaluationRulesForEvaluator = vi.mocked(
  queryModule.countEvaluationRulesForEvaluator,
);

const createEvaluationRuleRecord = (overrides?: Record<string, unknown>) =>
  ({
    id: "ceval_123",
    projectId: "project_123",
    evalTemplateId: "tmpl_project_v2",
    scoreName: "answer_quality",
    targetObject: EvalTargetObject.EVENT,
    filter: [],
    variableMapping: [
      {
        templateVariable: "input",
        selectedColumnId: "input",
        jsonSelector: null,
      },
    ],
    sampling: 1,
    status: JobConfigState.ACTIVE,
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    createdAt: new Date("2026-03-30T08:00:00.000Z"),
    updatedAt: new Date("2026-03-30T09:00:00.000Z"),
    evalTemplate: {
      id: "tmpl_project_v2",
      projectId: "project_123",
      name: "Answer correctness",
      vars: ["input"],
      prompt: "Judge {{input}}",
    },
    ...overrides,
  }) as any;

describe("unstable public eval services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountActiveEvaluationRules.mockResolvedValue(0);
    mockCountEvaluationRulesForEvaluator.mockResolvedValue(0);
    mockedPrisma.dataset.findMany.mockResolvedValue([]);

    mockedPrisma.$transaction.mockImplementation(async (callback) =>
      callback({
        evalTemplate: {
          create: mockEvalTemplateCreate,
          findMany: mockEvalTemplateFindMany,
        },
        jobConfiguration: {
          findMany: mockJobConfigurationFindMany,
          update: mockJobConfigurationUpdate,
        },
      }),
    );
  });

  it("rejects unrunnable evaluator submissions before writing", async () => {
    mockAssertEvaluatorDefinitionCanRunForPublicApi.mockRejectedValueOnce(
      createUnstablePublicApiError({
        httpCode: 422,
        code: "evaluator_preflight_failed",
        message: "No valid LLM model found for evaluator",
      }),
    );

    await expect(
      createPublicEvaluator({
        projectId: "project_123",
        input: {
          name: "Answer correctness",
          prompt: "Judge {{input}}",
          outputDefinition: numericOutputDefinition,
        },
      }),
    ).rejects.toThrow("No valid LLM model found for evaluator");

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockEvalTemplateCreate).not.toHaveBeenCalled();
  });

  it("creates a new project-owned evaluator family at version 1", async () => {
    mockEvalTemplateFindMany.mockResolvedValueOnce([]);
    mockEvalTemplateCreate.mockResolvedValueOnce({
      ...projectTemplate,
      id: "tmpl_project_v1",
      version: 1,
      createdAt: new Date("2026-03-31T08:00:00.000Z"),
      updatedAt: new Date("2026-03-31T08:00:00.000Z"),
    });

    const result = await createPublicEvaluator({
      projectId: "project_123",
      input: {
        name: "Answer correctness",
        prompt: "Judge {{input}}",
        outputDefinition: numericOutputDefinition,
      },
    });

    expect(mockEvalTemplateFindMany).toHaveBeenCalledWith({
      where: {
        projectId: "project_123",
        name: "Answer correctness",
      },
      select: {
        id: true,
        version: true,
      },
      orderBy: [
        {
          version: "desc",
        },
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
    });
    expect(mockEvalTemplateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project_123",
        name: "Answer correctness",
        version: 1,
      }),
    });
    expect(mockJobConfigurationFindMany).not.toHaveBeenCalled();
    expect(mockJobConfigurationUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "tmpl_project_v1",
      version: 1,
      scope: "project",
    });
  });

  it("creates a new evaluator version when the project name already exists", async () => {
    mockCountEvaluationRulesForEvaluator.mockResolvedValueOnce(2);
    mockEvalTemplateFindMany.mockResolvedValueOnce([
      {
        id: "tmpl_project_v2",
        version: 2,
      },
      {
        id: "tmpl_project_v1",
        version: 1,
      },
    ]);
    mockJobConfigurationFindMany.mockResolvedValueOnce([
      {
        id: "ceval_123",
        scoreName: "answer_quality",
        variableMapping: [
          {
            templateVariable: "input",
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
      },
    ]);
    mockEvalTemplateCreate.mockResolvedValueOnce({
      ...projectTemplate,
      id: "tmpl_project_v3",
      version: 3,
    });

    const result = await createPublicEvaluator({
      projectId: "project_123",
      input: {
        name: "Answer correctness",
        prompt: "Judge {{input}}",
        outputDefinition: numericOutputDefinition,
      },
    });

    expect(mockEvalTemplateCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "project_123",
        name: "Answer correctness",
        version: 3,
      }),
    });
    expect(mockJobConfigurationFindMany).toHaveBeenCalledWith({
      where: {
        projectId: "project_123",
        evalTemplateId: {
          in: ["tmpl_project_v2", "tmpl_project_v1"],
        },
      },
      select: {
        id: true,
        scoreName: true,
        variableMapping: true,
      },
    });
    expect(mockJobConfigurationUpdate).toHaveBeenCalledWith({
      where: {
        id: "ceval_123",
        projectId: "project_123",
      },
      data: {
        evalTemplateId: "tmpl_project_v3",
        variableMapping: [
          {
            templateVariable: "input",
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
      },
    });
    expect(result).toMatchObject({
      id: "tmpl_project_v3",
      version: 3,
      scope: "project",
      evaluationRuleCount: 2,
    });
  });

  it("drops obsolete variable mappings when auto-upgrading linked evaluation rules", async () => {
    mockEvalTemplateFindMany.mockResolvedValueOnce([
      {
        id: "tmpl_project_v2",
        version: 2,
      },
    ]);
    mockJobConfigurationFindMany.mockResolvedValueOnce([
      {
        id: "ceval_123",
        scoreName: "answer_quality",
        variableMapping: [
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
        ],
      },
    ]);
    mockEvalTemplateCreate.mockResolvedValueOnce({
      ...projectTemplate,
      id: "tmpl_project_v3",
      prompt: "Judge {{input}}",
      vars: ["input"],
      version: 3,
    });

    await createPublicEvaluator({
      projectId: "project_123",
      input: {
        name: "Answer correctness",
        prompt: "Judge {{input}}",
        outputDefinition: numericOutputDefinition,
      },
    });

    expect(mockJobConfigurationUpdate).toHaveBeenCalledWith({
      where: {
        id: "ceval_123",
        projectId: "project_123",
      },
      data: {
        evalTemplateId: "tmpl_project_v3",
        variableMapping: [
          {
            templateVariable: "input",
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
      },
    });
  });

  it("rejects evaluator version creation when linked evaluation rules need new mappings", async () => {
    mockEvalTemplateFindMany.mockResolvedValueOnce([
      {
        id: "tmpl_project_v2",
        version: 2,
      },
    ]);
    mockJobConfigurationFindMany.mockResolvedValueOnce([
      {
        id: "ceval_123",
        scoreName: "answer_quality",
        variableMapping: [
          {
            templateVariable: "input",
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
      },
    ]);

    await expect(
      createPublicEvaluator({
        projectId: "project_123",
        input: {
          name: "Answer correctness",
          prompt: "Judge {{input}} against {{output}}",
          outputDefinition: numericOutputDefinition,
        },
      }),
    ).rejects.toThrow(
      'Creating a new evaluator version would invalidate the evaluation rule "answer_quality"',
    );

    expect(mockEvalTemplateCreate).not.toHaveBeenCalled();
    expect(mockJobConfigurationUpdate).not.toHaveBeenCalled();
  });

  it("resolves an older evaluator version to the latest version when creating an evaluation rule", async () => {
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: {
        ...projectTemplate,
        id: "tmpl_project_v3",
        version: 3,
      },
    });
    mockedPrisma.jobConfiguration.create.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        evalTemplateId: "tmpl_project_v3",
        evalTemplate: {
          id: "tmpl_project_v3",
          projectId: "project_123",
          name: "Answer correctness",
          vars: ["input"],
          prompt: "Judge {{input}}",
        },
      }),
    );

    const result = await createPublicEvaluationRule({
      projectId: "project_123",
      input: {
        name: "answer_quality_latest",
        evaluator: {
          name: "Answer correctness",
          scope: "project",
        },
        target: "observation",
        enabled: true,
        sampling: 1,
        filter: [],
        mapping: [{ variable: "input", source: "input" }],
      },
    });

    expect(mockLoadEvaluatorForEvaluationRule).toHaveBeenCalledWith({
      projectId: "project_123",
      evaluator: {
        name: "Answer correctness",
        scope: "project",
      },
    });
    expect(mockedPrisma.jobConfiguration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evalTemplateId: "tmpl_project_v3",
      }),
      include: expect.any(Object),
    });
    expect(result).toMatchObject({
      evaluator: {
        id: "tmpl_project_v3",
        name: "Answer correctness",
        scope: "project",
      },
    });
  });

  it("rejects unrunnable enabled evaluation rules before writing", async () => {
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: projectTemplate,
    });
    mockAssertEvaluatorDefinitionCanRunForPublicApi.mockRejectedValueOnce(
      createUnstablePublicApiError({
        httpCode: 422,
        code: "evaluator_preflight_failed",
        message: "Model configuration not valid for evaluator",
      }),
    );

    await expect(
      createPublicEvaluationRule({
        projectId: "project_123",
        input: {
          name: "answer_quality",
          evaluator: {
            name: "Answer correctness",
            scope: "project",
          },
          target: "observation",
          enabled: true,
          sampling: 1,
          filter: [],
          mapping: [{ variable: "input", source: "input" }],
        },
      }),
    ).rejects.toThrow("Model configuration not valid for evaluator");

    expect(mockedPrisma.jobConfiguration.create).not.toHaveBeenCalled();
  });

  it("returns a conflict when an evaluation rule name already exists in the project", async () => {
    mockedPrisma.jobConfiguration.findFirst.mockResolvedValueOnce({
      id: "ceval_existing",
    });

    await expect(
      createPublicEvaluationRule({
        projectId: "project_123",
        input: {
          name: "answer_quality",
          evaluator: {
            name: "Answer correctness",
            scope: "project",
          },
          target: "observation",
          enabled: true,
          sampling: 1,
          filter: [],
          mapping: [{ variable: "input", source: "input" }],
        },
      }),
    ).rejects.toThrow(
      'An evaluation rule named "answer_quality" already exists in this project.',
    );

    expect(mockLoadEvaluatorForEvaluationRule).not.toHaveBeenCalled();
    expect(mockedPrisma.jobConfiguration.create).not.toHaveBeenCalled();
  });

  it("rejects creating more than 50 active evaluation rules", async () => {
    mockCountActiveEvaluationRules.mockResolvedValueOnce(50);

    await expect(
      createPublicEvaluationRule({
        projectId: "project_123",
        input: {
          name: "answer_quality",
          evaluator: {
            name: "Answer correctness",
            scope: "project",
          },
          target: "observation",
          enabled: true,
          sampling: 1,
          filter: [],
          mapping: [{ variable: "input", source: "input" }],
        },
      }),
    ).rejects.toThrow(
      "This project already has the maximum number of active evaluation rules (50).",
    );

    expect(mockLoadEvaluatorForEvaluationRule).not.toHaveBeenCalled();
    expect(mockedPrisma.jobConfiguration.create).not.toHaveBeenCalled();
  });

  it("rejects experiment evaluation rules that reference unknown dataset ids", async () => {
    mockedPrisma.dataset.findMany.mockResolvedValueOnce([
      { id: "dataset_valid" },
    ]);

    await expect(
      createPublicEvaluationRule({
        projectId: "project_123",
        input: {
          name: "experiment_answer_quality",
          evaluator: {
            name: "Answer correctness",
            scope: "project",
          },
          target: "experiment",
          enabled: true,
          sampling: 1,
          filter: [
            {
              type: "stringOptions",
              column: "datasetId",
              operator: "any of",
              value: ["dataset_valid", "dataset_missing"],
            },
          ],
          mapping: [{ variable: "input", source: "input" }],
        },
      }),
    ).rejects.toThrow(
      'Filter column "datasetId" contains dataset id(s) that do not exist in this project: dataset_missing',
    );

    expect(mockedPrisma.dataset.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project_123",
        id: {
          in: ["dataset_valid", "dataset_missing"],
        },
      },
      select: {
        id: true,
      },
    });
    expect(mockLoadEvaluatorForEvaluationRule).not.toHaveBeenCalled();
    expect(mockedPrisma.jobConfiguration.create).not.toHaveBeenCalled();
  });

  it("passes stored modelParams into create-time evaluator preflight", async () => {
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: {
        ...projectTemplate,
        provider: "openai",
        model: "gpt-4.1-mini",
        modelParams: { temperature: 0.2 },
      },
    });
    mockedPrisma.jobConfiguration.create.mockResolvedValueOnce(
      createEvaluationRuleRecord(),
    );

    await createPublicEvaluationRule({
      projectId: "project_123",
      input: {
        name: "answer_quality",
        evaluator: {
          name: "Answer correctness",
          scope: "project",
        },
        target: "observation",
        enabled: true,
        sampling: 1,
        filter: [],
        mapping: [{ variable: "input", source: "input" }],
      },
    });

    expect(
      mockAssertEvaluatorDefinitionCanRunForPublicApi,
    ).toHaveBeenCalledWith({
      projectId: "project_123",
      template: expect.objectContaining({
        name: "Answer correctness",
        provider: "openai",
        model: "gpt-4.1-mini",
        modelParams: { temperature: 0.2 },
      }),
    });
  });

  it("allows disabled evaluation rules without preflight", async () => {
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: projectTemplate,
    });
    mockedPrisma.jobConfiguration.create.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        status: JobConfigState.INACTIVE,
      }),
    );

    const result = await createPublicEvaluationRule({
      projectId: "project_123",
      input: {
        name: "answer_quality",
        evaluator: {
          name: "Answer correctness",
          scope: "project",
        },
        target: "observation",
        enabled: false,
        sampling: 1,
        filter: [],
        mapping: [{ variable: "input", source: "input" }],
      },
    });

    expect(
      mockAssertEvaluatorDefinitionCanRunForPublicApi,
    ).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      evaluator: {
        id: "tmpl_project_v2",
        name: "Answer correctness",
        scope: "project",
      },
      enabled: false,
      status: "inactive",
    });
  });

  it("allows evaluation rules to reference managed evaluators by exact template id", async () => {
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: managedTemplate,
    });
    mockedPrisma.jobConfiguration.create.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        evalTemplateId: "tmpl_managed",
        evalTemplate: {
          id: "tmpl_managed",
          projectId: null,
          name: "Answer correctness",
          vars: ["input"],
          prompt: "Judge {{input}}",
        },
      }),
    );

    const result = await createPublicEvaluationRule({
      projectId: "project_123",
      input: {
        name: "managed_answer_quality",
        evaluator: {
          name: "Answer correctness",
          scope: "managed",
        },
        target: "observation",
        enabled: true,
        sampling: 1,
        filter: [],
        mapping: [{ variable: "input", source: "input" }],
      },
    });

    expect(mockedPrisma.jobConfiguration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evalTemplateId: "tmpl_managed",
      }),
      include: expect.any(Object),
    });
    expect(result).toMatchObject({
      evaluator: {
        id: "tmpl_managed",
        name: "Answer correctness",
        scope: "managed",
      },
      enabled: true,
      status: "active",
    });
  });

  it("preserves block metadata when updating without a fresh successful preflight", async () => {
    mockFindPublicEvaluationRuleOrThrow.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        blockedAt: new Date("2026-03-30T10:00:00.000Z"),
        blockReason: "EVAL_MODEL_CONFIG_INVALID",
        blockMessage: "Evaluator paused",
      }),
    );
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: projectTemplate,
    });
    mockedPrisma.jobConfiguration.update.mockImplementationOnce(
      async ({ data }: any) =>
        createEvaluationRuleRecord({
          status: data.status,
          sampling: data.sampling,
          filter: data.filter,
          variableMapping: data.variableMapping,
          blockedAt: new Date("2026-03-30T10:00:00.000Z"),
          blockReason: "EVAL_MODEL_CONFIG_INVALID",
          blockMessage: "Evaluator paused",
        }),
    );

    const result = await updatePublicEvaluationRule({
      projectId: "project_123",
      evaluationRuleId: "ceval_123",
      input: {
        enabled: false,
      },
    });

    const updateArgs = mockedPrisma.jobConfiguration.update.mock.calls[0]?.[0];

    expect(
      mockAssertEvaluatorDefinitionCanRunForPublicApi,
    ).not.toHaveBeenCalled();
    expect(updateArgs?.data).not.toHaveProperty("blockedAt");
    expect(updateArgs?.data).not.toHaveProperty("blockReason");
    expect(updateArgs?.data).not.toHaveProperty("blockMessage");
    expect(result).toMatchObject({
      enabled: false,
      status: "inactive",
      pausedReason: "EVAL_MODEL_CONFIG_INVALID",
    });
  });

  it("passes stored modelParams into update-time evaluator preflight", async () => {
    mockFindPublicEvaluationRuleOrThrow.mockResolvedValueOnce(
      createEvaluationRuleRecord(),
    );
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: {
        ...projectTemplate,
        provider: "openai",
        model: "gpt-4.1-mini",
        modelParams: { temperature: 0.4 },
      },
    });
    mockedPrisma.jobConfiguration.update.mockResolvedValueOnce(
      createEvaluationRuleRecord(),
    );

    await updatePublicEvaluationRule({
      projectId: "project_123",
      evaluationRuleId: "ceval_123",
      input: {
        name: "renamed_answer_quality",
      },
    });

    expect(
      mockAssertEvaluatorDefinitionCanRunForPublicApi,
    ).toHaveBeenCalledWith({
      projectId: "project_123",
      template: expect.objectContaining({
        name: "Answer correctness",
        provider: "openai",
        model: "gpt-4.1-mini",
        modelParams: { temperature: 0.4 },
      }),
    });
  });

  it("rejects enabling a non-active evaluation rule when the active limit is reached", async () => {
    mockFindPublicEvaluationRuleOrThrow.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        status: JobConfigState.INACTIVE,
      }),
    );
    mockCountActiveEvaluationRules.mockResolvedValueOnce(50);

    await expect(
      updatePublicEvaluationRule({
        projectId: "project_123",
        evaluationRuleId: "ceval_123",
        input: {
          enabled: true,
        },
      }),
    ).rejects.toThrow(
      "This project already has the maximum number of active evaluation rules (50).",
    );

    expect(mockLoadEvaluatorForEvaluationRule).not.toHaveBeenCalled();
    expect(mockedPrisma.jobConfiguration.update).not.toHaveBeenCalled();
  });

  it("rejects experiment filter updates that reference unknown dataset ids", async () => {
    mockFindPublicEvaluationRuleOrThrow.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        targetObject: EvalTargetObject.EXPERIMENT,
      }),
    );
    mockedPrisma.dataset.findMany.mockResolvedValueOnce([]);

    await expect(
      updatePublicEvaluationRule({
        projectId: "project_123",
        evaluationRuleId: "ceval_123",
        input: {
          target: "experiment",
          filter: [
            {
              type: "stringOptions",
              column: "datasetId",
              operator: "any of",
              value: ["dataset_missing"],
            },
          ],
          mapping: [{ variable: "input", source: "input" }],
        },
      }),
    ).rejects.toThrow(
      'Filter column "datasetId" contains dataset id(s) that do not exist in this project: dataset_missing',
    );

    expect(mockedPrisma.dataset.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project_123",
        id: {
          in: ["dataset_missing"],
        },
      },
      select: {
        id: true,
      },
    });
    expect(mockLoadEvaluatorForEvaluationRule).not.toHaveBeenCalled();
    expect(mockedPrisma.jobConfiguration.update).not.toHaveBeenCalled();
  });

  it("allows unrelated experiment updates without revalidating stale stored dataset filters", async () => {
    mockFindPublicEvaluationRuleOrThrow.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        targetObject: EvalTargetObject.EXPERIMENT,
        filter: [
          {
            type: "stringOptions",
            column: "experimentDatasetId",
            operator: "any of",
            value: ["dataset_deleted"],
          },
        ],
      }),
    );
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: projectTemplate,
    });
    mockedPrisma.jobConfiguration.update.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        targetObject: EvalTargetObject.EXPERIMENT,
        scoreName: "renamed_experiment_answer_quality",
        filter: [
          {
            type: "stringOptions",
            column: "experimentDatasetId",
            operator: "any of",
            value: ["dataset_deleted"],
          },
        ],
      }),
    );

    const result = await updatePublicEvaluationRule({
      projectId: "project_123",
      evaluationRuleId: "ceval_123",
      input: {
        name: "renamed_experiment_answer_quality",
      },
    });

    expect(mockedPrisma.dataset.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.jobConfiguration.update).toHaveBeenCalled();
    expect(result).toMatchObject({
      name: "renamed_experiment_answer_quality",
      target: "experiment",
      filter: [
        {
          type: "stringOptions",
          column: "datasetId",
          operator: "any of",
          value: ["dataset_deleted"],
        },
      ],
    });
  });

  it("does not re-check the active limit for already-active evaluation rules", async () => {
    mockFindPublicEvaluationRuleOrThrow.mockResolvedValueOnce(
      createEvaluationRuleRecord(),
    );
    mockLoadEvaluatorForEvaluationRule.mockResolvedValueOnce({
      template: projectTemplate,
    });
    mockedPrisma.jobConfiguration.update.mockResolvedValueOnce(
      createEvaluationRuleRecord({
        scoreName: "renamed_answer_quality",
      }),
    );

    await updatePublicEvaluationRule({
      projectId: "project_123",
      evaluationRuleId: "ceval_123",
      input: {
        name: "renamed_answer_quality",
      },
    });

    expect(mockCountActiveEvaluationRules).not.toHaveBeenCalled();
    expect(mockedPrisma.jobConfiguration.update).toHaveBeenCalled();
  });
});
