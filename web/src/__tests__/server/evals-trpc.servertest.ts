import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  createNumericEvalOutputDefinition,
  EvalTargetObject,
  EvalTemplateType,
  EvaluatorBlockReason,
  EvaluatorSourceCodeLanguage,
  ForbiddenError,
  JobConfigState,
  LangfuseConflictError,
} from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { LegacyEvalCompatibilityService } from "@/src/features/evals/server/legacyCompatibilityService";

const organizationIds: string[] = [];
const numericOutputDefinition = createNumericEvalOutputDefinition({
  reasoningDescription: "Why the score was assigned",
  scoreDescription: "A score between 0 and 1",
});

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();
  organizationIds.push(org.id);
  return {
    project,
    service: new LegacyEvalCompatibilityService(prisma),
  };
}

async function createLegacyRule(
  projectId: string,
  options: { name?: string; targetObject?: string } = {},
) {
  const name = options.name ?? "Legacy score";
  return prisma.evaluationRule.create({
    data: {
      project: { connect: { id: projectId } },
      name,
      targetObject: options.targetObject ?? EvalTargetObject.TRACE,
      filter: [],
      sampling: 1,
      delay: 0,
      timeScope: ["NEW"],
      assignments: {
        create: {
          project: { connect: { id: projectId } },
          evaluator: {
            create: {
              project: { connect: { id: projectId } },
              name,
              type: EvalTemplateType.LLM_AS_JUDGE,
              versions: {
                create: {
                  version: 1,
                  prompt: "Judge {{input}}",
                  vars: ["input"],
                  variableMapping: [],
                  outputDefinition: numericOutputDefinition,
                },
              },
            },
          },
          variableMapping: [],
        },
      },
    },
  });
}

async function createLibraryEvaluator(
  projectId: string,
  { name }: { name: string },
) {
  return prisma.evaluator.create({
    data: {
      projectId,
      name,
      type: EvalTemplateType.LLM_AS_JUDGE,
      versions: {
        create: {
          version: 1,
          prompt: "Judge {{input}}",
          vars: ["input"],
          variableMapping: [],
          outputDefinition: numericOutputDefinition,
        },
      },
    },
    include: { versions: true },
  });
}

describe("legacy evaluator compatibility service", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  });

  it("projects a single-assignment legacy-target rule", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);

    const config = await service.getConfig(project.id, rule.id);

    expect(config).toMatchObject({
      id: rule.id,
      scoreName: "Legacy score",
      targetObject: EvalTargetObject.TRACE,
      timeScope: ["NEW"],
    });
    expect(config?.evalTemplate?.name).toBe("Legacy score");
  });

  it("projects an unassigned legacy-target rule for its read-only view", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    await prisma.evaluationRuleEvaluatorAssignment.deleteMany({
      where: { evaluationRuleId: rule.id },
    });

    const config = await service.getConfig(project.id, rule.id);

    expect(config).toMatchObject({
      id: rule.id,
      scoreName: "Legacy score",
      targetObject: EvalTargetObject.TRACE,
      evalTemplate: null,
    });
  });

  it("does not project an unassigned modern rule as a legacy config", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id, {
      targetObject: EvalTargetObject.EVENT,
    });
    await prisma.evaluationRuleEvaluatorAssignment.deleteMany({
      where: { evaluationRuleId: rule.id },
    });

    await expect(service.getConfig(project.id, rule.id)).resolves.toBeNull();
  });

  it("projects the assignment mapping instead of the evaluator version mapping", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    const assignmentMapping = [
      {
        templateVariable: "input",
        langfuseObject: "trace",
        selectedColumnId: "output",
      },
    ];
    await prisma.evaluationRuleEvaluatorAssignment.updateMany({
      where: { evaluationRuleId: rule.id },
      data: { variableMapping: assignmentMapping },
    });

    const config = await service.getConfig(project.id, rule.id);

    expect(config?.variableMapping).toEqual(assignmentMapping);
  });

  it("writes legacy mapping edits to the assignment only", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    const assignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: rule.id },
        include: { evaluator: { include: { versions: true } } },
      });
    const versionMapping = assignment.evaluator.versions[0]!.variableMapping;
    const assignmentMapping = [
      {
        templateVariable: "input",
        langfuseObject: "trace",
        selectedColumnId: "input",
      },
    ];

    const config = await service.updateConfig({
      projectId: project.id,
      ruleId: rule.id,
      data: { variableMapping: assignmentMapping },
    });

    expect(config.variableMapping).toEqual(assignmentMapping);
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.findUnique({
        where: { id: assignment.id },
        select: { variableMapping: true },
      }),
    ).resolves.toEqual({ variableMapping: assignmentMapping });
    await expect(
      prisma.evaluatorVersion.findUnique({
        where: { id: assignment.evaluator.versions[0]!.id },
        select: { variableMapping: true },
      }),
    ).resolves.toEqual({ variableMapping: versionMapping });
  });

  it("does not flatten multi-assignment modern rules", async () => {
    const { project, service } = await prepare();
    const first = await createLegacyRule(project.id);
    const secondEvaluator = await prisma.evaluator.create({
      data: {
        projectId: project.id,
        name: "Second",
        type: EvalTemplateType.CODE,
        versions: {
          create: {
            version: 1,
            sourceCode: "return 1",
            sourceCodeLanguage: EvaluatorSourceCodeLanguage.TYPESCRIPT,
          },
        },
      },
    });
    await prisma.evaluationRuleEvaluatorAssignment.create({
      data: {
        projectId: project.id,
        evaluationRuleId: first.id,
        evaluatorId: secondEvaluator.id,
      },
    });

    await expect(service.getConfig(project.id, first.id)).resolves.toBeNull();
  });

  it("forks a dedicated evaluator when the score name differs from the library evaluator", async () => {
    const { project, service } = await prepare();
    const library = await createLibraryEvaluator(project.id, {
      name: "Library definition",
    });
    const evaluatorCountBefore = await prisma.evaluator.count({
      where: { projectId: project.id },
    });

    const rule = await service.createConfig({
      projectId: project.id,
      templateId: library.versions[0]!.id,
      scoreName: "Production score",
      targetObject: EvalTargetObject.DATASET,
      filter: [],
      variableMapping: [],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });

    expect(rule).not.toBeNull();
    const config = await service.getConfig(project.id, rule!.id);
    expect(config?.scoreName).toBe("Production score");
    expect(config?.evalTemplate?.name).toBe("Production score");
    expect(config?.evalTemplateId).not.toBe(library.versions[0]!.id);
    await expect(
      prisma.evaluator.count({ where: { projectId: project.id } }),
    ).resolves.toBe(evaluatorCountBefore + 1);
  });

  it("reuses the picked library evaluator when the score name matches", async () => {
    const { project, service } = await prepare();
    const library = await createLibraryEvaluator(project.id, {
      name: "Toxicity",
    });
    const evaluatorCountBefore = await prisma.evaluator.count({
      where: { projectId: project.id },
    });

    const rule = await service.createConfig({
      projectId: project.id,
      templateId: library.versions[0]!.id,
      scoreName: "Toxicity",
      targetObject: EvalTargetObject.DATASET,
      filter: [],
      variableMapping: [],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });

    expect(rule).not.toBeNull();
    await expect(
      prisma.evaluator.count({ where: { projectId: project.id } }),
    ).resolves.toBe(evaluatorCountBefore);
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.findFirst({
        where: { evaluationRuleId: rule!.id },
        select: { evaluatorId: true },
      }),
    ).resolves.toEqual({ evaluatorId: library.id });
    const config = await service.getConfig(project.id, rule!.id);
    expect(config?.evalTemplateId).toBe(library.versions[0]!.id);
  });

  it("uses the latest definition when the picked evaluator version is stale", async () => {
    const { project, service } = await prepare();
    const library = await createLibraryEvaluator(project.id, {
      name: "Toxicity",
    });
    await prisma.evaluatorVersion.create({
      data: {
        evaluatorId: library.id,
        version: 2,
        prompt: "Judge {{input}} strictly",
        vars: ["input"],
        variableMapping: [],
        outputDefinition: numericOutputDefinition,
      },
    });

    const rule = await service.createConfig({
      projectId: project.id,
      templateId: library.versions[0]!.id,
      scoreName: "Toxicity",
      targetObject: EvalTargetObject.TRACE,
      filter: [],
      variableMapping: [
        {
          templateVariable: "input",
          langfuseObject: "trace",
          selectedColumnId: "input",
        },
      ],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });

    const assignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: rule!.id },
      });
    expect(assignment.evaluatorId).toBe(library.id);
    const config = await service.getConfig(project.id, rule!.id);
    expect(config?.evalTemplate?.prompt).toBe("Judge {{input}} strictly");
  });

  it("rejects a stale create form when the latest version needs another mapping", async () => {
    const { project, service } = await prepare();
    const library = await createLibraryEvaluator(project.id, {
      name: "Toxicity",
    });
    await prisma.evaluatorVersion.create({
      data: {
        evaluatorId: library.id,
        version: 2,
        prompt: "Judge {{input}} and {{output}}",
        vars: ["input", "output"],
        variableMapping: [],
        outputDefinition: numericOutputDefinition,
      },
    });

    await expect(
      service.createConfig({
        projectId: project.id,
        templateId: library.versions[0]!.id,
        scoreName: "Toxicity",
        targetObject: EvalTargetObject.TRACE,
        filter: [],
        variableMapping: [
          {
            templateVariable: "input",
            langfuseObject: "trace",
            selectedColumnId: "input",
          },
        ],
        sampling: 1,
        delay: 0,
        status: "ACTIVE",
        timeScope: ["NEW"],
        createdByUserId: null,
      }),
    ).rejects.toThrow(
      'Evaluator template "Toxicity" changed while this form was open. Reload the page and configure the latest version before creating this evaluator. Missing mappings: output.',
    );
  });

  it("reuses the project copy of a managed template", async () => {
    const { project, service } = await prepare();
    const managed = service
      .listManagedTemplates()
      .find(({ type }) => type === EvalTemplateType.LLM_AS_JUDGE);
    if (!managed) throw new Error("no managed LLM template in the catalog");
    const projectCopy = await prisma.evaluator.create({
      data: {
        projectId: project.id,
        name: managed.name,
        type: EvalTemplateType.LLM_AS_JUDGE,
        versions: {
          create: {
            version: 1,
            prompt: managed.prompt,
            provider: null,
            model: null,
            vars: managed.vars,
            variableMapping: [],
            outputDefinition: managed.outputDefinition as Prisma.InputJsonValue,
          },
        },
      },
    });
    const evaluatorCountBefore = await prisma.evaluator.count({
      where: { projectId: project.id },
    });

    const rule = await service.createConfig({
      projectId: project.id,
      templateId: managed.id,
      scoreName: managed.name,
      targetObject: EvalTargetObject.DATASET,
      filter: [],
      variableMapping: [],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });

    await expect(
      prisma.evaluator.count({ where: { projectId: project.id } }),
    ).resolves.toBe(evaluatorCountBefore);
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.findFirst({
        where: { evaluationRuleId: rule!.id },
        select: { evaluatorId: true },
      }),
    ).resolves.toEqual({ evaluatorId: projectCopy.id });
  });

  it("renames the evaluator in place while a single rule uses it", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    const assignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: rule.id },
      });

    const config = await service.updateConfig({
      projectId: project.id,
      ruleId: rule.id,
      data: { scoreName: "Renamed score" },
    });

    expect(config.scoreName).toBe("Renamed score");
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.findUnique({
        where: { id: assignment.id },
        select: { evaluatorId: true },
      }),
    ).resolves.toEqual({ evaluatorId: assignment.evaluatorId });
    await expect(
      prisma.evaluator.findUnique({
        where: { id: assignment.evaluatorId },
        select: { name: true },
      }),
    ).resolves.toEqual({ name: "Renamed score" });
  });

  it("forks the evaluator on rename when another rule shares it", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    const assignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: rule.id },
        include: { evaluator: { include: { versions: true } } },
      });
    const sharedRule = await prisma.evaluationRule.create({
      data: {
        projectId: project.id,
        name: "Shared rule",
        targetObject: EvalTargetObject.TRACE,
        filter: [],
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
        assignments: {
          create: {
            projectId: project.id,
            evaluatorId: assignment.evaluatorId,
            variableMapping: [],
          },
        },
      },
    });

    const config = await service.updateConfig({
      projectId: project.id,
      ruleId: rule.id,
      data: { scoreName: "Renamed score" },
    });

    expect(config.scoreName).toBe("Renamed score");
    const renamedAssignment =
      await prisma.evaluationRuleEvaluatorAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: { evaluator: { include: { versions: true } } },
      });
    expect(renamedAssignment.evaluatorId).not.toBe(assignment.evaluatorId);
    expect(renamedAssignment.evaluator.name).toBe("Renamed score");
    expect(renamedAssignment.evaluator.versions[0]?.prompt).toBe(
      assignment.evaluator.versions[0]?.prompt,
    );
    // the rule that was not renamed keeps its evaluator and its score name
    const sharedConfig = await service.getConfig(project.id, sharedRule.id);
    expect(sharedConfig?.scoreName).toBe("Legacy score");
    await expect(
      prisma.evaluator.findUnique({
        where: { id: assignment.evaluatorId },
        select: { name: true },
      }),
    ).resolves.toEqual({ name: "Legacy score" });
  });

  it("shares the evaluator while retaining the inactive legacy assignment", async () => {
    const { project, service } = await prepare();
    const legacyRule = await createLegacyRule(project.id);
    const legacyConfig = await service.getConfig(project.id, legacyRule.id);
    const legacyAssignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: legacyRule.id },
      });
    const evaluatorCountBefore = await prisma.evaluator.count({
      where: { projectId: project.id },
    });

    const remappedRule = await service.createConfig({
      projectId: project.id,
      templateId: legacyConfig!.evalTemplateId,
      reuseEvaluatorFromRuleId: legacyRule.id,
      scoreName: "Remapped score",
      targetObject: EvalTargetObject.EVENT,
      filter: [],
      variableMapping: [],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });

    expect(remappedRule).not.toBeNull();
    await expect(
      prisma.evaluator.count({ where: { projectId: project.id } }),
    ).resolves.toBe(evaluatorCountBefore);
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.findFirst({
        where: { evaluationRuleId: remappedRule!.id },
        select: { evaluatorId: true },
      }),
    ).resolves.toEqual({ evaluatorId: legacyAssignment.evaluatorId });
    await expect(
      prisma.evaluationRule.findUnique({
        where: { id: legacyRule.id },
        select: {
          status: true,
          assignments: { select: { evaluatorId: true } },
        },
      }),
    ).resolves.toEqual({
      status: "INACTIVE",
      assignments: [{ evaluatorId: legacyAssignment.evaluatorId }],
    });

    await service.deleteConfig(project.id, legacyRule.id);

    await expect(
      prisma.evaluator.findUnique({
        where: { id: legacyAssignment.evaluatorId },
      }),
    ).resolves.not.toBeNull();
  });

  it("deletes the source rule when sharing its evaluator", async () => {
    const { project, service } = await prepare();
    const legacyRule = await createLegacyRule(project.id);
    const legacyConfig = await service.getConfig(project.id, legacyRule.id);

    const remappedRule = await service.createConfig({
      projectId: project.id,
      templateId: legacyConfig!.evalTemplateId,
      reuseEvaluatorFromRuleId: legacyRule.id,
      sourceRuleAction: "delete",
      scoreName: "Remapped score",
      targetObject: EvalTargetObject.EVENT,
      filter: [],
      variableMapping: [],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });

    await expect(
      prisma.evaluationRule.findUnique({ where: { id: legacyRule.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.count({
        where: { evaluationRuleId: remappedRule!.id },
      }),
    ).resolves.toBe(1);
  });

  it("deletes the rule while retaining its evaluator", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    const config = await service.getConfig(project.id, rule.id);
    const evaluatorVersionId = config!.evalTemplateId;

    await expect(service.deleteConfig(project.id, rule.id)).resolves.toBe(true);
    await expect(
      prisma.evaluatorVersion.findUnique({ where: { id: evaluatorVersionId } }),
    ).resolves.not.toBeNull();
  });

  it("updates and deletes observation-level rules", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id, {
      targetObject: EvalTargetObject.EVENT,
    });

    const updated = await service.updateConfig({
      projectId: project.id,
      ruleId: rule.id,
      data: { status: JobConfigState.INACTIVE },
    });
    expect(updated.status).toBe(JobConfigState.INACTIVE);

    await expect(service.deleteConfig(project.id, rule.id)).resolves.toBe(true);
    await expect(
      prisma.evaluationRule.findUnique({ where: { id: rule.id } }),
    ).resolves.toBeNull();
  });

  it("reports a missing rule instead of silently skipping the delete", async () => {
    const { project, service } = await prepare();

    await expect(
      service.deleteConfig(project.id, "does-not-exist"),
    ).resolves.toBe(false);
  });

  it("removes job executions together with the rule", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    await prisma.jobExecution.create({
      data: {
        projectId: project.id,
        jobConfigurationId: rule.id,
        status: "COMPLETED",
      },
    });

    await service.deleteConfig(project.id, rule.id);

    await expect(
      prisma.jobExecution.count({
        where: { projectId: project.id, jobConfigurationId: rule.id },
      }),
    ).resolves.toBe(0);
  });

  it("unblocks the evaluator when the rule is reactivated", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    const assignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: rule.id },
      });
    await prisma.evaluator.update({
      where: { id: assignment.evaluatorId },
      data: {
        blockedAt: new Date(),
        blockReason: EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING,
        blockMessage: "paused",
      },
    });
    await prisma.evaluationRule.update({
      where: { id: rule.id },
      data: { status: JobConfigState.INACTIVE },
    });

    const config = await service.updateConfig({
      projectId: project.id,
      ruleId: rule.id,
      data: { status: JobConfigState.ACTIVE },
    });

    expect(config.blockedAt).toBeNull();
    await expect(
      prisma.evaluator.findUnique({
        where: { id: assignment.evaluatorId },
        select: { blockedAt: true, blockReason: true, blockMessage: true },
      }),
    ).resolves.toEqual({
      blockedAt: null,
      blockReason: null,
      blockMessage: null,
    });
  });

  it("filters, orders and counts configurations consistently", async () => {
    const { project, service } = await prepare();
    const active = await createLegacyRule(project.id, { name: "Active rule" });
    const inactive = await createLegacyRule(project.id, {
      name: "Inactive rule",
    });
    await prisma.evaluationRule.update({
      where: { id: inactive.id },
      data: { status: JobConfigState.INACTIVE },
    });
    // a modern multi-evaluator rule must neither be listed nor counted
    const modern = await createLegacyRule(project.id, { name: "Modern rule" });
    const extraEvaluator = await createLibraryEvaluator(project.id, {
      name: "Extra",
    });
    await prisma.evaluationRuleEvaluatorAssignment.create({
      data: {
        projectId: project.id,
        evaluationRuleId: modern.id,
        evaluatorId: extraEvaluator.id,
      },
    });

    const all = await service.listConfigs({ projectId: project.id });
    expect(all.totalCount).toBe(2);
    expect(all.configs).toHaveLength(2);

    const activeOnly = await service.listConfigs({
      projectId: project.id,
      filter: [
        {
          column: "status",
          type: "stringOptions",
          operator: "any of",
          value: [JobConfigState.ACTIVE],
        },
      ],
    });
    expect(activeOnly.totalCount).toBe(1);
    expect(activeOnly.configs.map(({ id }) => id)).toEqual([active.id]);

    await prisma.evaluationRule.update({
      where: { id: active.id },
      data: { createdAt: new Date("2024-01-01T00:00:00.000Z") },
    });
    await prisma.evaluationRule.update({
      where: { id: inactive.id },
      data: { createdAt: new Date("2024-01-02T00:00:00.000Z") },
    });
    const ordered = await service.listConfigs({
      projectId: project.id,
      orderBy: { column: "createdAt", order: "ASC" },
    });
    expect(ordered.configs.map(({ id }) => id)).toEqual([
      active.id,
      inactive.id,
    ]);
  });

  it("orders configurations by generated score name", async () => {
    const { project, service } = await prepare();
    const zeta = await createLegacyRule(project.id, { name: "zeta-score" });
    const alpha = await createLegacyRule(project.id, { name: "alpha-score" });
    const beta = await createLegacyRule(project.id, { name: "beta-score" });

    const ascending = await service.listConfigs({
      projectId: project.id,
      orderBy: { column: "scoreName", order: "ASC" },
    });
    expect(ascending.configs.map(({ id }) => id)).toEqual([
      alpha.id,
      beta.id,
      zeta.id,
    ]);

    const descending = await service.listConfigs({
      projectId: project.id,
      orderBy: { column: "scoreName", order: "DESC" },
    });
    expect(descending.configs.map(({ id }) => id)).toEqual([
      zeta.id,
      beta.id,
      alpha.id,
    ]);
  });

  it("keeps duplicate score names in stable order across pages", async () => {
    const { project, service } = await prepare();
    const first = await createLegacyRule(project.id, {
      name: "duplicate-score",
    });
    const second = await createLegacyRule(project.id, {
      name: "duplicate-score",
    });
    const third = await createLegacyRule(project.id, {
      name: "duplicate-score",
    });
    const expectedIds = [first.id, second.id, third.id].toSorted();

    const page0 = await service.listConfigs({
      projectId: project.id,
      orderBy: { column: "scoreName", order: "ASC" },
      limit: 2,
      page: 0,
    });
    const page1 = await service.listConfigs({
      projectId: project.id,
      orderBy: { column: "scoreName", order: "ASC" },
      limit: 2,
      page: 1,
    });

    expect([
      ...page0.configs.map(({ id }) => id),
      ...page1.configs.map(({ id }) => id),
    ]).toEqual(expectedIds);
  });

  it("falls back to created-at order when orderBy is cleared", async () => {
    const { project, service } = await prepare();
    const older = await createLegacyRule(project.id, { name: "older-score" });
    const newer = await createLegacyRule(project.id, { name: "newer-score" });
    await prisma.evaluationRule.update({
      where: { id: older.id },
      data: {
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-03-01T00:00:00.000Z"),
      },
    });
    await prisma.evaluationRule.update({
      where: { id: newer.id },
      data: {
        createdAt: new Date("2024-02-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    });

    const result = await service.listConfigs({
      projectId: project.id,
      orderBy: null,
    });

    expect(result.configs.map(({ id }) => id)).toEqual([newer.id, older.id]);
  });

  it("paginates without over-reporting the total", async () => {
    const { project, service } = await prepare();
    await createLegacyRule(project.id, { name: "First" });
    await createLegacyRule(project.id, { name: "Second" });

    const page = await service.listConfigs({
      projectId: project.id,
      page: 0,
      limit: 1,
    });

    expect(page.configs).toHaveLength(1);
    expect(page.totalCount).toBe(2);
  });

  it("carries variable mappings over to a new evaluator version", async () => {
    const { project, service } = await prepare();
    const library = await createLibraryEvaluator(project.id, {
      name: "Toxicity",
    });
    const rule = await service.createConfig({
      projectId: project.id,
      templateId: library.versions[0]!.id,
      scoreName: "Toxicity",
      targetObject: EvalTargetObject.TRACE,
      filter: [],
      variableMapping: [
        {
          templateVariable: "input",
          langfuseObject: "trace",
          selectedColumnId: "input",
        },
      ],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });

    const result = await service.saveTemplate({
      projectId: project.id,
      name: "Toxicity",
      createdByUserId: null,
      intent: {
        type: "new-version",
        sourceTemplateId: library.versions[0]!.id,
      },
      definition: {
        type: EvalTemplateType.LLM_AS_JUDGE,
        promptMessages: [{ role: "user", content: "Judge {{input}}" }],
        provider: null,
        model: null,
        modelParams: null,
        vars: ["input"],
        variableMapping: null,
        outputDefinition: numericOutputDefinition,
      },
    });

    expect(result?.template.version).toBe(2);
    expect(result?.updatedConfigCount).toBe(1);
    const config = await service.getConfig(project.id, rule!.id);
    expect(config?.variableMapping).toEqual([
      {
        templateVariable: "input",
        langfuseObject: "trace",
        selectedColumnId: "input",
      },
    ]);
  });

  it("carries an inherited observation mapping over to a new evaluator version", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id, {
      name: "Toxicity",
      targetObject: EvalTargetObject.EVENT,
    });
    const assignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: rule.id },
        include: { evaluator: { include: { versions: true } } },
      });
    const inheritedMapping = [
      {
        templateVariable: "input",
        selectedColumnId: "input",
      },
    ];
    await prisma.evaluatorVersion.update({
      where: { id: assignment.evaluator.versions[0]!.id },
      data: { variableMapping: inheritedMapping },
    });
    await prisma.evaluationRuleEvaluatorAssignment.update({
      where: { id: assignment.id },
      data: { variableMapping: Prisma.DbNull },
    });

    const result = await service.saveTemplate({
      projectId: project.id,
      name: "Toxicity",
      createdByUserId: null,
      intent: {
        type: "new-version",
        sourceTemplateId: assignment.evaluator.versions[0]!.id,
      },
      definition: {
        type: EvalTemplateType.LLM_AS_JUDGE,
        promptMessages: [{ role: "user", content: "Judge {{input}} strictly" }],
        provider: null,
        model: null,
        modelParams: null,
        vars: ["input"],
        variableMapping: null,
        outputDefinition: numericOutputDefinition,
      },
    });

    expect(result?.template.version).toBe(2);
    expect(result?.updatedConfigCount).toBe(1);
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.findUnique({
        where: { id: assignment.id },
        select: { variableMapping: true },
      }),
    ).resolves.toEqual({ variableMapping: inheritedMapping });
  });

  it("refuses a new version that leaves a running rule unmapped", async () => {
    const { project, service } = await prepare();
    const library = await createLibraryEvaluator(project.id, {
      name: "Toxicity",
    });
    await service.createConfig({
      projectId: project.id,
      templateId: library.versions[0]!.id,
      scoreName: "Toxicity",
      targetObject: EvalTargetObject.TRACE,
      filter: [],
      variableMapping: [
        {
          templateVariable: "input",
          langfuseObject: "trace",
          selectedColumnId: "input",
        },
      ],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });

    await expect(
      service.saveTemplate({
        projectId: project.id,
        name: "Toxicity",
        createdByUserId: null,
        intent: {
          type: "new-version",
          sourceTemplateId: library.versions[0]!.id,
        },
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          promptMessages: [
            {
              role: "user",
              content: "Judge {{input}} and {{expected}}",
            },
          ],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["input", "expected"],
          variableMapping: null,
          outputDefinition: numericOutputDefinition,
        },
      }),
    ).rejects.toBeInstanceOf(LangfuseConflictError);
    await expect(
      prisma.evaluatorVersion.count({ where: { evaluatorId: library.id } }),
    ).resolves.toBe(1);
  });

  it("reports a name clash as a conflict", async () => {
    const { project, service } = await prepare();
    await createLibraryEvaluator(project.id, { name: "Toxicity" });

    await expect(
      service.saveTemplate({
        projectId: project.id,
        name: "Toxicity",
        createdByUserId: null,
        intent: { type: "new" },
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          promptMessages: [{ role: "user", content: "Judge {{input}}" }],
          provider: null,
          model: null,
          modelParams: null,
          vars: ["input"],
          variableMapping: null,
          outputDefinition: numericOutputDefinition,
        },
      }),
    ).rejects.toBeInstanceOf(LangfuseConflictError);
  });

  it("refuses to delete an evaluator that a rule still uses", async () => {
    const { project, service } = await prepare();
    const rule = await createLegacyRule(project.id);
    const config = await service.getConfig(project.id, rule.id);

    await expect(
      service.deleteTemplate(project.id, config!.evalTemplateId),
    ).rejects.toBeInstanceOf(LangfuseConflictError);
    await expect(
      service.getTemplateUsage(project.id, config!.evalTemplateId),
    ).resolves.toHaveLength(1);
  });

  it("refuses to delete a Langfuse managed evaluator", async () => {
    const { project, service } = await prepare();
    const managed = service.listManagedTemplates()[0]!;

    await expect(
      service.deleteTemplate(project.id, managed.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("collapses an untouched managed copy into its catalog entry", async () => {
    const { project, service } = await prepare();
    const managed = service
      .listManagedTemplates()
      .find(({ type }) => type === EvalTemplateType.LLM_AS_JUDGE);
    if (!managed) throw new Error("no managed LLM template in the catalog");
    const copy = await prisma.evaluator.create({
      data: {
        projectId: project.id,
        name: managed.name,
        type: EvalTemplateType.LLM_AS_JUDGE,
        versions: {
          create: {
            version: 1,
            prompt: managed.prompt,
            provider: null,
            model: null,
            vars: managed.vars,
            variableMapping: [],
            outputDefinition: managed.outputDefinition as Prisma.InputJsonValue,
          },
        },
      },
      include: { versions: true },
    });

    const families = await service.listTemplateFamilies({
      projectId: project.id,
      page: 0,
      limit: 200,
      searchQuery: managed.name,
    });
    const rows = families.templates.filter(({ name }) => name === managed.name);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.latestId).toBe(managed.id);

    const picker = await service.listTemplates(project.id, {
      collapseManagedCopies: true,
    });
    expect(picker.filter(({ name }) => name === managed.name)).toHaveLength(1);

    // the full list still carries the copy: the template form needs it to warn
    // about the name before the server rejects it
    const all = await service.listTemplates(project.id);
    expect(
      all
        .filter(({ projectId }) => projectId === project.id)
        .map(({ id }) => id),
    ).toEqual([copy.versions[0]!.id]);
  });

  it("keeps an edited copy visible and folds usage into the catalog entry", async () => {
    const { project, service } = await prepare();
    const managed = service
      .listManagedTemplates()
      .find(({ type }) => type === EvalTemplateType.LLM_AS_JUDGE);
    if (!managed) throw new Error("no managed LLM template in the catalog");

    const rule = await service.createConfig({
      projectId: project.id,
      templateId: managed.id,
      scoreName: managed.name,
      targetObject: EvalTargetObject.TRACE,
      filter: [],
      variableMapping: [],
      sampling: 1,
      delay: 0,
      status: "ACTIVE",
      timeScope: ["NEW"],
      createdByUserId: null,
    });
    expect(rule).not.toBeNull();

    const collapsed = await service.listTemplateFamilies({
      projectId: project.id,
      page: 0,
      limit: 200,
      searchQuery: managed.name,
    });
    const managedRow = collapsed.templates.find(
      ({ latestId }) => latestId === managed.id,
    );
    expect(managedRow?.usageCount).toBe(1);
    expect(
      collapsed.templates.filter(({ name }) => name === managed.name),
    ).toHaveLength(1);

    // editing the copy makes it a genuinely custom evaluator again
    const assignment =
      await prisma.evaluationRuleEvaluatorAssignment.findFirstOrThrow({
        where: { evaluationRuleId: rule!.id },
      });
    await prisma.evaluatorVersion.create({
      data: {
        evaluatorId: assignment.evaluatorId,
        version: 2,
        prompt: "Judge this differently {{input}}",
        vars: managed.vars,
        variableMapping: [],
        outputDefinition: managed.outputDefinition as Prisma.InputJsonValue,
      },
    });

    const expanded = await service.listTemplateFamilies({
      projectId: project.id,
      page: 0,
      limit: 200,
      searchQuery: managed.name,
    });
    expect(
      expanded.templates.filter(({ name }) => name === managed.name),
    ).toHaveLength(2);
    expect(
      expanded.templates.find(({ latestId }) => latestId === managed.id)
        ?.usageCount,
    ).toBe(0);
  });

  it("includes the static managed catalog without database templates", async () => {
    const { service } = await prepare();
    const templates = service.listManagedTemplates();

    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every(({ id }) => id.startsWith("managed:"))).toBe(true);
  });

  it("scopes evaluator versions to the project", async () => {
    const first = await prepare();
    const second = await prepare();
    const id = randomUUID();
    await prisma.evaluator.create({
      data: {
        projectId: first.project.id,
        name: "Private evaluator",
        type: EvalTemplateType.CODE,
        versions: {
          create: {
            id,
            version: 1,
            sourceCode: "return 1",
            sourceCodeLanguage: EvaluatorSourceCodeLanguage.TYPESCRIPT,
          },
        },
      },
    });

    await expect(
      second.service.getTemplate(second.project.id, id),
    ).resolves.toBeNull();
  });
});
