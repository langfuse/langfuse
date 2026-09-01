import type * as PrismaClientModule from "@prisma/client";
import type { Mock } from "vitest";

const { evaluator, codeEvaluator } = vi.hoisted(() => ({
  codeEvaluator: {
    id: "code-evaluator",
    projectId: "project",
    name: "Toxicity",
    type: "CODE" as const,
    description: null,
    createdByUserId: null,
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    versions: [
      {
        id: "code-version",
        evaluatorId: "code-evaluator",
        version: 1,
        createdAt: new Date("2026-01-01"),
        createdByUserId: null,
        prompt: null,
        partner: null,
        provider: null,
        model: null,
        modelParams: null,
        vars: [],
        variableMapping: null,
        outputDefinition: null,
        sourceCode: "def evaluate(ctx): return []",
        sourceCodeLanguage: "PYTHON" as const,
      },
    ],
  },
  evaluator: {
    id: "evaluator",
    projectId: "project",
    name: "Quality",
    type: "LLM_AS_JUDGE" as const,
    description: null,
    createdByUserId: null,
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    versions: [
      {
        id: "version",
        evaluatorId: "evaluator",
        version: 1,
        createdAt: new Date("2026-01-01"),
        createdByUserId: null,
        prompt: "Judge {{output}}",
        partner: null,
        provider: "openai",
        model: "gpt-4o-mini",
        modelParams: {},
        vars: ["output"],
        variableMapping: [
          {
            templateVariable: "output",
            selectedColumnId: "output",
            jsonSelector: null,
          },
        ],
        outputDefinition: { score: { type: "NUMERIC", min: 0, max: 1 } },
        sourceCode: null,
        sourceCodeLanguage: null,
      },
    ],
  },
}));

vi.mock("@langfuse/shared/src/db", async () => {
  const actual =
    await vi.importActual<typeof PrismaClientModule>("@prisma/client");
  const prisma = {
    evaluator: { count: vi.fn(), findMany: vi.fn() },
    evaluationRule: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
    jobExecution: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
    evaluationRuleEvaluatorAssignment: { update: vi.fn(), create: vi.fn() },
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: typeof prisma) => unknown) => callback(prisma),
  );
  return {
    EvalTemplateType: actual.EvalTemplateType,
    JobConfigState: actual.JobConfigState,
    Prisma: { DbNull: { dbNull: true } },
    prisma,
  };
});

vi.mock("@/src/features/evals/server/unstable-public-api/queries", () => ({
  findPublicV2EvaluatorByIdOrThrow: vi.fn().mockResolvedValue(evaluator),
  findPublicV2EvaluatorInFamilyOrThrow: vi.fn().mockResolvedValue(evaluator),
  findPublicV2EvaluationRule: vi.fn(),
  listPublicEvaluationRulePage: vi.fn(),
}));

vi.mock(
  "@/src/features/evals/server/unstable-public-api/validation",
  async () => ({
    ...(await vi.importActual(
      "@/src/features/evals/server/unstable-public-api/validation",
    )),
    assertEvaluationRuleFilterValuesExistForProject: vi.fn(),
    assertEvaluatorDefinitionCanRunForPublicApi: vi.fn(),
  }),
);

vi.mock("@/src/features/evals/server/codeEvalJobConfigValidation", () => ({
  CodeEvalJobConfigError: class CodeEvalJobConfigError extends Error {
    constructor(
      message: string,
      public readonly code = "preflight_failed",
    ) {
      super(message);
    }
  },
  assertCodeEvalRuleCanRun: vi.fn(),
}));

vi.mock("@/src/features/evals/server/isCodeEvalEnabled", () => ({
  isCodeEvalEnabled: vi.fn().mockReturnValue(true),
  isCodeEvalSourceCodeLanguageSupported: vi.fn().mockReturnValue(true),
}));

vi.mock("@langfuse/shared/src/server", async () => ({
  ...(await vi.importActual("@langfuse/shared/src/server")),
  invalidateProjectEvalConfigCaches: vi.fn(),
}));

import { prisma } from "@langfuse/shared/src/db";
import {
  CodeEvalJobConfigError,
  assertCodeEvalRuleCanRun,
} from "@/src/features/evals/server/codeEvalJobConfigValidation";
import {
  createPublicEvaluationRule,
  deletePublicEvaluationRule,
  listPublicEvaluationRules,
  updatePublicEvaluationRule,
} from "@/src/features/evals/server/unstable-public-api/evaluation-rule-service";
import {
  findPublicV2EvaluationRule,
  findPublicV2EvaluatorInFamilyOrThrow,
  listPublicEvaluationRulePage,
} from "@/src/features/evals/server/unstable-public-api/queries";
import { MAX_ACTIVE_EVALUATION_RULES } from "@/src/features/evals/v2/server/rules/ruleErrors";

function buildCreatedRule(data: {
  projectId: string;
  name: string;
  status: string;
  targetObject: string;
  filter: unknown;
  sampling: number;
}) {
  return {
    id: "rule",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    projectId: data.projectId,
    createdByUserId: null,
    name: data.name,
    status: data.status,
    targetObject: data.targetObject,
    filter: data.filter,
    sampling: {
      toNumber: () => data.sampling,
      valueOf: () => data.sampling,
    },
    delay: 0,
    timeScope: ["NEW"],
    assignments: [
      {
        id: "assignment",
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        projectId: "project",
        evaluationRuleId: "rule",
        evaluatorId: evaluator.id,
        variableMapping: null,
        evaluator,
      },
    ],
  };
}

function buildMigratedRuleWithLegacyFilter() {
  const migratedRule = buildCreatedRule({
    projectId: "project",
    name: "Migrated rule",
    status: "ACTIVE",
    targetObject: "event",
    filter: [
      {
        type: "string",
        column: "environment",
        operator: "does not contain",
        value: "langfuse-",
      },
      {
        type: "null",
        column: "experimentId",
        operator: "is null",
        value: "",
      },
    ],
    sampling: 1,
  });
  return migratedRule;
}

describe("unstable public evaluation-rule service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.evaluator.count as Mock).mockResolvedValue(1);
    (prisma.evaluator.findMany as Mock).mockResolvedValue([evaluator]);
    (prisma.evaluationRule.count as Mock).mockResolvedValue(0);
    (findPublicV2EvaluatorInFamilyOrThrow as Mock).mockResolvedValue(evaluator);
    (findPublicV2EvaluationRule as Mock).mockImplementation(
      () => (prisma.evaluationRule.create as Mock).mock.results.at(-1)?.value,
    );
  });

  it("creates rules and assignments only in the new tables", async () => {
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(null);
    (prisma.evaluationRule.create as Mock).mockImplementation(({ data }) =>
      buildCreatedRule(data),
    );

    await expect(
      createPublicEvaluationRule({
        orgId: "org",
        projectId: "project",
        input: {
          name: "Quality rule",
          evaluator: {
            name: "Quality",
            type: "llm_as_judge",
          },
          target: "observation",
          enabled: false,
          sampling: 1,
          filter: [],
          mapping: [{ variable: "output", source: "output" }],
        },
      }),
    ).resolves.toMatchObject({ id: "rule", target: "observation" });
    expect(prisma.evaluationRule.create).toHaveBeenCalledOnce();
  });

  it("resolves the evaluator family by name and type within the project", async () => {
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(null);
    (prisma.evaluationRule.create as Mock).mockImplementation(({ data }) =>
      buildCreatedRule(data),
    );

    await createPublicEvaluationRule({
      orgId: "org",
      projectId: "project",
      input: {
        name: "Quality rule",
        evaluator: { name: "Quality", type: "llm_as_judge" },
        target: "observation",
        enabled: false,
        sampling: 1,
        filter: [],
        mapping: [{ variable: "output", source: "output" }],
      },
    });

    expect(findPublicV2EvaluatorInFamilyOrThrow).toHaveBeenCalledWith({
      projectId: "project",
      evaluator: { name: "Quality", type: "llm_as_judge" },
    });
  });

  it("rejects creating more active evaluation rules than the shared cap", async () => {
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(null);
    (prisma.evaluationRule.count as Mock).mockResolvedValue(
      MAX_ACTIVE_EVALUATION_RULES,
    );

    await expect(
      createPublicEvaluationRule({
        orgId: "org",
        projectId: "project",
        input: {
          name: "One too many",
          evaluator: {
            name: "Quality",
            type: "llm_as_judge",
          },
          target: "observation",
          enabled: true,
          sampling: 1,
          filter: [],
          mapping: [{ variable: "output", source: "output" }],
        },
      }),
    ).rejects.toMatchObject({
      httpCode: 409,
      code: "conflict",
      details: { limit: MAX_ACTIVE_EVALUATION_RULES },
    });
    expect(prisma.evaluationRule.create).not.toHaveBeenCalled();
  });

  it("does not check the active limit for disabled evaluation rules", async () => {
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(null);
    (prisma.evaluationRule.create as Mock).mockImplementation(({ data }) =>
      buildCreatedRule(data),
    );

    await createPublicEvaluationRule({
      orgId: "org",
      projectId: "project",
      input: {
        name: "Disabled rule",
        evaluator: { name: "Quality", type: "llm_as_judge" },
        target: "observation",
        enabled: false,
        sampling: 1,
        filter: [],
        mapping: [{ variable: "output", source: "output" }],
      },
    });

    expect(prisma.evaluationRule.count).not.toHaveBeenCalled();
  });

  it("returns a name conflict when a rule with that name already exists", async () => {
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue({
      id: "existing-rule",
    });

    await expect(
      createPublicEvaluationRule({
        orgId: "org",
        projectId: "project",
        input: {
          name: "Quality rule",
          evaluator: {
            name: "Quality",
            type: "llm_as_judge",
          },
          target: "observation",
          enabled: false,
          sampling: 1,
          filter: [],
          mapping: [{ variable: "output", source: "output" }],
        },
      }),
    ).rejects.toMatchObject({
      httpCode: 409,
      code: "name_conflict",
      details: { field: "name" },
    });
    expect(prisma.evaluationRule.create).not.toHaveBeenCalled();
  });

  it("translates code-eval preflight failures into structured public API errors", async () => {
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(null);
    (findPublicV2EvaluatorInFamilyOrThrow as Mock).mockResolvedValue(
      codeEvaluator,
    );
    (assertCodeEvalRuleCanRun as Mock).mockRejectedValue(
      new CodeEvalJobConfigError("Sandbox run failed", "preflight_failed"),
    );

    await expect(
      createPublicEvaluationRule({
        orgId: "org",
        projectId: "project",
        input: {
          name: "Code rule",
          evaluator: { name: "Toxicity", type: "code" },
          target: "observation",
          enabled: true,
          sampling: 1,
          filter: [],
        },
      }),
    ).rejects.toMatchObject({
      httpCode: 422,
      code: "evaluator_preflight_failed",
      message: "Sandbox run failed",
      details: { evaluatorName: "Toxicity" },
    });
    expect(prisma.evaluationRule.create).not.toHaveBeenCalled();
  });

  it("translates code-eval invalid-target failures into a 400", async () => {
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(null);
    (findPublicV2EvaluatorInFamilyOrThrow as Mock).mockResolvedValue(
      codeEvaluator,
    );
    (assertCodeEvalRuleCanRun as Mock).mockRejectedValue(
      new CodeEvalJobConfigError("Unsupported target", "invalid_target"),
    );

    await expect(
      createPublicEvaluationRule({
        orgId: "org",
        projectId: "project",
        input: {
          name: "Code rule",
          evaluator: { name: "Toxicity", type: "code" },
          target: "observation",
          enabled: true,
          sampling: 1,
          filter: [],
        },
      }),
    ).rejects.toMatchObject({ httpCode: 400, code: "invalid_request" });
  });

  it("lists migrated rules with filters that do not match their current target", async () => {
    const migratedRule = buildMigratedRuleWithLegacyFilter();
    (listPublicEvaluationRulePage as Mock).mockResolvedValue({
      records: [migratedRule],
      totalItems: 1,
    });

    await expect(
      listPublicEvaluationRules({ projectId: "project", page: 1, limit: 50 }),
    ).resolves.toMatchObject({
      data: [
        {
          id: "rule",
          filter: [
            {
              type: "string",
              column: "environment",
              operator: "does not contain",
              value: "langfuse-",
            },
            {
              type: "null",
              column: "experimentId",
              operator: "is null",
              value: "",
            },
          ],
        },
      ],
      meta: { totalItems: 1 },
    });
  });

  it("preserves migrated filters on patches that do not replace them", async () => {
    const migratedRule = buildMigratedRuleWithLegacyFilter();
    (findPublicV2EvaluationRule as Mock).mockResolvedValue(migratedRule);
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(migratedRule);
    (prisma.evaluationRule.update as Mock).mockImplementation(({ data }) => {
      migratedRule.name = data.name ?? migratedRule.name;
      return migratedRule;
    });

    await expect(
      updatePublicEvaluationRule({
        orgId: "org",
        projectId: "project",
        evaluationRuleId: "rule",
        input: { name: "Renamed rule", target: "observation" },
      }),
    ).resolves.toMatchObject({
      name: "Renamed rule",
      filter: [{ column: "environment" }, { column: "experimentId" }],
    });
    expect(prisma.evaluationRule.update).toHaveBeenCalledOnce();
  });

  it("repairs migrated rules with a V2-compatible replacement filter", async () => {
    const migratedRule = buildMigratedRuleWithLegacyFilter();
    const replacementFilter = [
      {
        type: "boolean" as const,
        column: "isRootObservation",
        operator: "=" as const,
        value: true,
      },
    ];
    (findPublicV2EvaluationRule as Mock).mockResolvedValue(migratedRule);
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(migratedRule);
    (prisma.evaluationRule.update as Mock).mockImplementation(({ data }) => {
      migratedRule.filter = data.filter;
      migratedRule.status = data.status;
      return migratedRule;
    });

    await expect(
      updatePublicEvaluationRule({
        orgId: "org",
        projectId: "project",
        evaluationRuleId: "rule",
        input: {
          target: "observation",
          filter: replacementFilter,
          enabled: false,
        },
      }),
    ).resolves.toMatchObject({ filter: replacementFilter, enabled: false });
    expect(prisma.evaluationRule.update).toHaveBeenCalledOnce();
  });

  it("requires a replacement filter when changing the target of a migrated rule", async () => {
    const migratedRule = buildMigratedRuleWithLegacyFilter();
    (findPublicV2EvaluationRule as Mock).mockResolvedValue(migratedRule);
    (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(migratedRule);

    await expect(
      updatePublicEvaluationRule({
        orgId: "org",
        projectId: "project",
        evaluationRuleId: "rule",
        input: { target: "experiment" },
      }),
    ).rejects.toMatchObject({
      httpCode: 400,
      code: "invalid_body",
      details: { field: "filter" },
    });
    expect(prisma.evaluationRule.update).not.toHaveBeenCalled();
  });

  it.each([
    {
      operation: "disabled",
      mutate: () =>
        updatePublicEvaluationRule({
          orgId: "org",
          projectId: "project",
          evaluationRuleId: "rule",
          input: { enabled: false },
        }),
    },
    {
      operation: "deleted",
      mutate: () =>
        deletePublicEvaluationRule({
          projectId: "project",
          evaluationRuleId: "rule",
        }),
    },
  ])(
    "allows a migrated rule with an unsupported stored filter to be $operation",
    async ({ mutate, operation }) => {
      const migratedRule = buildMigratedRuleWithLegacyFilter();
      (findPublicV2EvaluationRule as Mock).mockResolvedValue(migratedRule);
      (prisma.evaluationRule.findFirst as Mock).mockResolvedValue(migratedRule);
      (prisma.evaluationRule.update as Mock).mockImplementation(({ data }) => {
        migratedRule.status = data.status ?? migratedRule.status;
        return migratedRule;
      });
      (prisma.evaluationRule.deleteMany as Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.jobExecution.deleteMany as Mock).mockResolvedValue({ count: 0 });

      const result = await mutate();
      if (operation === "disabled") {
        expect(result).toMatchObject({ enabled: false, status: "inactive" });
        expect(prisma.evaluationRule.update).toHaveBeenCalledOnce();
      } else {
        expect(prisma.evaluationRule.deleteMany).toHaveBeenCalledOnce();
      }
    },
  );
});
