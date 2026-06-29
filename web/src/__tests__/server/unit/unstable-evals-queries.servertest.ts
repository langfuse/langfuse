import type { Mock } from "vitest";

vi.mock("@langfuse/shared/src/db", () => {
  return {
    Prisma: {
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings,
        values,
      }),
    },
    prisma: {
      $queryRaw: vi.fn(),
      evalTemplate: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      jobConfiguration: {
        count: vi.fn(),
        groupBy: vi.fn(),
      },
    },
  };
});

import { prisma } from "@langfuse/shared/src/db";
import {
  countActiveEvaluationRules,
  countEvaluationRulesForEvaluatorIds,
  loadEvaluatorForEvaluationRule,
  listPublicEvaluatorTemplates,
} from "@/src/features/evals/server/unstable-public-api/queries";

const mockQueryRaw = prisma.$queryRaw as Mock;
const mockEvalTemplateFindMany = prisma.evalTemplate.findMany as Mock;
const mockEvalTemplateFindFirst = prisma.evalTemplate.findFirst as Mock;
const mockJobConfigurationCount = prisma.jobConfiguration.count as Mock;
const mockJobConfigurationGroupBy = prisma.jobConfiguration.groupBy as Mock;

describe("unstable public eval queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("paginates latest evaluator versions per family before loading exact templates", async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { id: "tmpl_project_v2" },
        { id: "tmpl_managed_v7" },
      ])
      .mockResolvedValueOnce([{ count: 3n }]);
    mockEvalTemplateFindMany.mockResolvedValueOnce([
      {
        id: "tmpl_managed_v7",
        projectId: null,
        name: "Answer correctness",
        version: 7,
      },
      {
        id: "tmpl_project_v2",
        projectId: "project_123",
        name: "Answer correctness",
        version: 2,
      },
    ]);

    const result = await listPublicEvaluatorTemplates({
      projectId: "project_123",
      page: 2,
      limit: 2,
    });

    expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    expect(mockEvalTemplateFindMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["tmpl_project_v2", "tmpl_managed_v7"],
        },
      },
    });
    expect(result.totalItems).toBe(3);
    expect(result.templates.map((template) => template.id)).toEqual([
      "tmpl_project_v2",
      "tmpl_managed_v7",
    ]);
  });

  it("skips the groupBy lookup when no evaluator ids are requested", async () => {
    const result = await countEvaluationRulesForEvaluatorIds({
      projectId: "project_123",
      evaluatorIds: [],
    });

    expect(result).toEqual({});
    expect(mockJobConfigurationGroupBy).not.toHaveBeenCalled();
  });

  it("counts evaluation rules by exact evaluator template id", async () => {
    mockJobConfigurationGroupBy.mockResolvedValueOnce([
      {
        evalTemplateId: "tmpl_project_v2",
        _count: { _all: 2 },
      },
      {
        evalTemplateId: "tmpl_managed_v7",
        _count: { _all: 1 },
      },
    ]);

    const result = await countEvaluationRulesForEvaluatorIds({
      projectId: "project_123",
      evaluatorIds: ["tmpl_project_v2", "tmpl_managed_v7"],
    });

    expect(mockJobConfigurationGroupBy).toHaveBeenCalledWith({
      by: ["evalTemplateId"],
      where: {
        projectId: "project_123",
        targetObject: {
          in: ["event", "experiment"],
        },
        evalTemplateId: {
          in: ["tmpl_project_v2", "tmpl_managed_v7"],
        },
      },
      _count: {
        _all: true,
      },
    });
    expect(result).toEqual({
      tmpl_project_v2: 2,
      tmpl_managed_v7: 1,
    });
  });

  it("counts all active evaluation rules in the project", async () => {
    mockJobConfigurationCount.mockResolvedValueOnce(17);

    const result = await countActiveEvaluationRules({
      projectId: "project_123",
    });

    expect(mockJobConfigurationCount).toHaveBeenCalledWith({
      where: {
        projectId: "project_123",
        jobType: "EVAL",
        targetObject: {
          in: ["event", "experiment"],
        },
        status: "ACTIVE",
        blockedAt: null,
      },
    });
    expect(result).toBe(17);
  });

  it("resolves project evaluator families to the latest version by name and scope", async () => {
    mockEvalTemplateFindFirst.mockResolvedValueOnce({
      id: "tmpl_project_v3",
      projectId: "project_123",
      name: "Answer correctness",
      version: 3,
    });

    const result = await loadEvaluatorForEvaluationRule({
      projectId: "project_123",
      evaluator: {
        name: "Answer correctness",
        scope: "project",
      },
    });
    expect(mockEvalTemplateFindFirst).toHaveBeenCalledWith({
      where: {
        projectId: "project_123",
        name: "Answer correctness",
      },
      orderBy: {
        version: "desc",
      },
    });
    expect(result.template.id).toBe("tmpl_project_v3");
  });

  it("resolves managed evaluator families by name and scope", async () => {
    mockEvalTemplateFindFirst.mockResolvedValueOnce({
      id: "tmpl_managed_v7",
      projectId: null,
      name: "Answer correctness",
      version: 7,
    });

    const result = await loadEvaluatorForEvaluationRule({
      projectId: "project_123",
      evaluator: {
        name: "Answer correctness",
        scope: "managed",
      },
    });

    expect(mockEvalTemplateFindFirst).toHaveBeenCalledWith({
      where: {
        projectId: null,
        name: "Answer correctness",
      },
      orderBy: {
        version: "desc",
      },
    });
    expect(result.template.id).toBe("tmpl_managed_v7");
  });
});
