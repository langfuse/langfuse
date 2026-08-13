import { randomUUID } from "node:crypto";
import { EvalTargetObject } from "@langfuse/shared";
import type * as SharedServer from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
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
import { RuleService } from "@/src/features/evals/v2/server/rules/ruleService";
import { MAX_ACTIVE_EVALUATION_RULES } from "@/src/features/evals/v2/server/rules/ruleErrors";

const telemetryMocks = vi.hoisted(() => ({
  getRecentRuleExecutionTraces: vi.fn(),
  getTotalCostByRule: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  getRecentRuleExecutionTraces: telemetryMocks.getRecentRuleExecutionTraces,
  getTotalCostByRule: telemetryMocks.getTotalCostByRule,
}));

const orgIds: string[] = [];
let projectId = "";
let otherProjectId = "";

beforeAll(async () => {
  const [first, second] = await Promise.all([
    createOrgProjectAndApiKey(),
    createOrgProjectAndApiKey(),
  ]);
  projectId = first.project.id;
  otherProjectId = second.project.id;
  orgIds.push(first.org.id, second.org.id);
});

beforeEach(() => {
  telemetryMocks.getRecentRuleExecutionTraces.mockReset();
  telemetryMocks.getTotalCostByRule.mockReset();
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
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

function createEvaluator(
  targetProjectId = projectId,
  name = `evaluator-${randomUUID()}`,
) {
  return prisma.evaluator.create({
    data: {
      projectId: targetProjectId,
      name,
      type: "LLM_AS_JUDGE",
      versions: {
        create: {
          version: 1,
          prompt: "Judge {{output}}",
          vars: ["output"],
          variableMapping: [
            { templateVariable: "output", selectedColumnId: "output" },
          ],
        },
      },
    },
  });
}

function createInput(evaluatorId?: string) {
  return {
    projectId,
    name: "Production generations",
    targetObject: EvalTargetObject.EVENT,
    filter: [
      {
        type: "stringOptions" as const,
        column: "environment",
        operator: "any of" as const,
        value: ["production"],
      },
    ],
    sampling: 0.25,
    enabled: true as const,
    evaluatorAssignments: evaluatorId
      ? [{ evaluatorId, variableMapping: null }]
      : [],
  };
}

const createService = (
  audit: ConstructorParameters<typeof RuleService>[1] = async () => undefined,
) => new RuleService(prisma, audit);

describe("RuleService", () => {
  describe("list", () => {
    it("returns project rules converted to the service response", async () => {
      const evaluator = await createEvaluator();
      const service = createService();
      const rule = await service.create(createInput(evaluator.id), null);

      await expect(
        service.list({ projectId, page: 1, limit: 50 }),
      ).resolves.toMatchObject({
        rules: [
          {
            id: rule.id,
            enabled: true,
            sampling: 0.25,
            assignments: [
              {
                evaluatorId: evaluator.id,
                evaluator: {
                  latestVersion: {
                    variableMapping: [
                      {
                        templateVariable: "output",
                        selectedColumnId: "output",
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
        totalItems: 1,
      });
    });
  });

  describe("telemetry", () => {
    it("returns recent event-backed traces grouped by rule", async () => {
      const timestamp = new Date("2026-08-12T12:00:00.000Z");
      telemetryMocks.getRecentRuleExecutionTraces.mockResolvedValue([
        { ruleId: "rule-1", id: "trace-1", level: "DEFAULT", timestamp },
      ]);

      await expect(
        createService().listRecent({
          projectId,
          ruleIds: ["rule-1", "rule-2"],
        }),
      ).resolves.toEqual({
        "rule-1": [{ id: "trace-1", level: "DEFAULT", timestamp }],
        "rule-2": [],
      });
      expect(telemetryMocks.getRecentRuleExecutionTraces).toHaveBeenCalledWith(
        projectId,
        ["rule-1", "rule-2"],
      );
    });

    it("returns event-backed costs by rule", async () => {
      telemetryMocks.getTotalCostByRule.mockResolvedValue([
        { ruleId: "rule-1", totalCost: 1.25 },
      ]);

      await expect(
        createService().getTotalCosts({
          projectId,
          ruleIds: ["rule-1"],
        }),
      ).resolves.toEqual({ "rule-1": 1.25 });
      expect(telemetryMocks.getTotalCostByRule).toHaveBeenCalledWith(
        projectId,
        ["rule-1"],
      );
    });
  });

  describe("create", () => {
    it("creates an active observation rule without evaluator assignments", async () => {
      await expect(
        createService().create(createInput(), null),
      ).resolves.toMatchObject({
        enabled: true,
        targetObject: "event",
        timeScope: ["NEW"],
        delay: 0,
        sampling: 0.25,
        assignments: [],
      });
    });

    it("returns evaluator mapping fallback data", async () => {
      const evaluator = await createEvaluator();

      await expect(
        createService().create(createInput(evaluator.id), null),
      ).resolves.toMatchObject({
        assignments: [
          {
            evaluatorId: evaluator.id,
            variableMapping: null,
            evaluator: {
              latestVersion: {
                variableMapping: [
                  { templateVariable: "output", selectedColumnId: "output" },
                ],
              },
            },
          },
        ],
      });
    });

    it("creates a disabled observation rule when requested", async () => {
      const evaluator = await createEvaluator();

      await expect(
        createService().create(
          { ...createInput(evaluator.id), enabled: false },
          null,
        ),
      ).resolves.toMatchObject({ enabled: false });
    });

    it("creates an experiment rule with experiment filters and mappings", async () => {
      const evaluator = await createEvaluator();

      await expect(
        createService().create(
          {
            ...createInput(evaluator.id),
            targetObject: EvalTargetObject.EXPERIMENT,
            filter: [
              {
                type: "stringOptions",
                column: "experimentDatasetId",
                operator: "any of",
                value: ["dataset-id"],
              },
            ],
            evaluatorAssignments: [
              {
                evaluatorId: evaluator.id,
                variableMapping: [
                  {
                    templateVariable: "output",
                    selectedColumnId: "experimentItemExpectedOutput",
                  },
                ],
              },
            ],
          },
          null,
        ),
      ).resolves.toMatchObject({
        targetObject: EvalTargetObject.EVENT,
        filter: [
          {
            column: "experimentDatasetId",
            value: ["dataset-id"],
          },
          {
            column: "isExperimentItemRootSpan",
            operator: "=",
            value: true,
          },
        ],
        assignments: [
          {
            variableMapping: [
              {
                templateVariable: "output",
                selectedColumnId: "experimentItemExpectedOutput",
              },
            ],
          },
        ],
      });
    });

    it("rejects invalid filters and foreign evaluators without persisting", async () => {
      const foreignEvaluator = await createEvaluator(otherProjectId);
      const service = createService();

      await expect(
        service.create(
          {
            ...createInput(),
            filter: [
              {
                type: "numberObject",
                column: "scores_avg",
                key: "quality",
                operator: ">",
                value: 0.5,
              },
            ],
          },
          null,
        ),
      ).rejects.toThrow('Filter column "scores_avg" is not supported');
      await expect(
        service.create(createInput(foreignEvaluator.id), null),
      ).rejects.toThrow("Evaluator not found");
      await expect(
        prisma.evaluationRule.count({ where: { projectId } }),
      ).resolves.toBe(0);
    });
  });

  describe("get and update", () => {
    it("rejects cross-project reads", async () => {
      const rule = await createService().create(createInput(), null);

      await expect(
        createService().get(otherProjectId, rule.id),
      ).rejects.toThrow("Evaluation rule not found");
    });

    it("updates fields and replaces assignments atomically", async () => {
      const [first, second] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);
      const service = createService();
      const rule = await service.create(createInput(first.id), null);
      const variableMapping = [
        { templateVariable: "output", selectedColumnId: "input" },
      ];

      const updated = await service.update({
        projectId,
        ruleId: rule.id,
        name: "Renamed rule",
        sampling: 0.75,
        evaluatorMappings: [{ evaluatorId: second.id, variableMapping }],
      });

      expect(updated).toMatchObject({
        name: "Renamed rule",
        sampling: 0.75,
        assignments: [{ evaluatorId: second.id, variableMapping }],
      });
      expect(updated.assignments).toHaveLength(1);
    });

    it("normalizes legacy experiment rules on read and persists them canonically on update", async () => {
      const service = createService();
      const rule = await service.create(createInput(), null);
      await prisma.evaluationRule.update({
        where: { id: rule.id },
        data: {
          targetObject: EvalTargetObject.EXPERIMENT,
          filter: [],
        },
      });

      await expect(service.get(projectId, rule.id)).resolves.toMatchObject({
        targetObject: EvalTargetObject.EVENT,
        filter: [
          {
            column: "isExperimentItemRootSpan",
            operator: "=",
            value: true,
          },
        ],
      });

      await service.update({
        projectId,
        ruleId: rule.id,
        name: "Canonical experiment rule",
      });

      await expect(
        prisma.evaluationRule.findUniqueOrThrow({ where: { id: rule.id } }),
      ).resolves.toMatchObject({
        targetObject: EvalTargetObject.EVENT,
        filter: [
          {
            column: "isExperimentItemRootSpan",
            operator: "=",
            value: true,
          },
        ],
      });
    });
  });

  describe("listRulesForEvaluator", () => {
    it("returns assignments for the evaluator", async () => {
      const evaluator = await createEvaluator();
      const service = createService();
      const rule = await service.create(createInput(evaluator.id), null);

      await expect(
        service.listRulesForEvaluator(projectId, evaluator.id),
      ).resolves.toEqual([
        expect.objectContaining({
          evaluationRule: expect.objectContaining({ id: rule.id }),
        }),
      ]);
    });

    it("rejects an unavailable evaluator", async () => {
      const evaluator = await createEvaluator();

      await expect(
        createService().listRulesForEvaluator(otherProjectId, evaluator.id),
      ).rejects.toThrow("Evaluator not found");
    });
  });

  describe("countRulesForEvaluators", () => {
    it("returns counts for the requested evaluators", async () => {
      const [assigned, unassigned] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);
      const service = createService();
      await service.create(createInput(assigned.id), null);

      await expect(
        service.countRulesForEvaluators(projectId, [
          assigned.id,
          unassigned.id,
        ]),
      ).resolves.toEqual({ [assigned.id]: 1 });
    });
  });

  describe("attach", () => {
    it("attaches an evaluator", async () => {
      const [first, second] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);
      const service = createService();
      const rule = await service.create(createInput(first.id), null);

      await expect(
        service.attach({
          projectId,
          ruleId: rule.id,
          assignment: { evaluatorId: second.id, variableMapping: null },
        }),
      ).resolves.toMatchObject({
        assignments: expect.arrayContaining([
          expect.objectContaining({ evaluatorId: second.id }),
        ]),
      });
    });

    it("updates experiment filters and assignments", async () => {
      const [first, second] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);
      const service = createService();
      const rule = await service.create(
        {
          ...createInput(first.id),
          targetObject: EvalTargetObject.EXPERIMENT,
          filter: [],
        },
        null,
      );

      await expect(
        service.update({
          projectId,
          ruleId: rule.id,
          targetObject: EvalTargetObject.EXPERIMENT,
          filter: [
            {
              type: "stringOptions",
              column: "experimentDatasetId",
              operator: "any of",
              value: ["dataset-id"],
            },
          ],
          evaluatorMappings: [
            {
              evaluatorId: second.id,
              variableMapping: [
                {
                  templateVariable: "output",
                  selectedColumnId: "experimentItemExpectedOutput",
                },
              ],
            },
          ],
        }),
      ).resolves.toMatchObject({
        targetObject: EvalTargetObject.EVENT,
        filter: [
          { column: "experimentDatasetId" },
          { column: "isExperimentItemRootSpan", value: true },
        ],
        assignments: [
          {
            evaluatorId: second.id,
            variableMapping: [
              { selectedColumnId: "experimentItemExpectedOutput" },
            ],
          },
        ],
      });
    });

    it("lets an update drop the experiment scope by omitting its root filter", async () => {
      const service = createService();
      const rule = await service.create(
        {
          ...createInput(),
          targetObject: EvalTargetObject.EXPERIMENT,
          filter: [],
        },
        null,
      );

      // A filter-bearing update re-decides the experiment classification, so
      // removing the root filter is not silently undone.
      await expect(
        service.update({
          projectId,
          ruleId: rule.id,
          filter: [
            {
              type: "stringOptions",
              column: "environment",
              operator: "any of",
              value: ["production"],
            },
          ],
        }),
      ).resolves.toMatchObject({
        targetObject: EvalTargetObject.EVENT,
        filter: [{ column: "environment" }],
      });
    });

    it("keeps the experiment scope when an update does not touch the filter", async () => {
      const service = createService();
      const rule = await service.create(
        {
          ...createInput(),
          targetObject: EvalTargetObject.EXPERIMENT,
          filter: [],
        },
        null,
      );

      await expect(
        service.update({ projectId, ruleId: rule.id, name: "Renamed" }),
      ).resolves.toMatchObject({
        targetObject: EvalTargetObject.EVENT,
        filter: [{ column: "isExperimentItemRootSpan", value: true }],
      });
    });

    it("rejects a foreign evaluator", async () => {
      const foreignEvaluator = await createEvaluator(otherProjectId);
      const service = createService();
      const rule = await service.create(createInput(), null);

      await expect(
        service.attach({
          projectId,
          ruleId: rule.id,
          assignment: {
            evaluatorId: foreignEvaluator.id,
            variableMapping: null,
          },
        }),
      ).rejects.toThrow("Evaluator not found");
    });
  });

  describe("update with evaluatorMappings", () => {
    it("replaces an assignment override", async () => {
      const evaluator = await createEvaluator();
      const service = createService();
      const rule = await service.create(createInput(evaluator.id), null);

      await expect(
        service.update({
          projectId,
          ruleId: rule.id,
          evaluatorMappings: [
            {
              evaluatorId: evaluator.id,
              variableMapping: [
                { templateVariable: "output", selectedColumnId: "input" },
              ],
            },
          ],
        }),
      ).resolves.toMatchObject({
        assignments: [
          {
            evaluatorId: evaluator.id,
            variableMapping: [
              { templateVariable: "output", selectedColumnId: "input" },
            ],
          },
        ],
      });
    });

    it("rejects an evaluator from another project", async () => {
      const service = createService();
      const rule = await service.create(createInput(), null);

      await expect(
        service.update({
          projectId,
          ruleId: rule.id,
          evaluatorMappings: [
            { evaluatorId: "missing-evaluator", variableMapping: null },
          ],
        }),
      ).rejects.toThrow("Evaluator not found");
    });

    it("disables the rule when all evaluator assignments are removed", async () => {
      const evaluator = await createEvaluator();
      const service = createService();
      const rule = await service.create(createInput(evaluator.id), null);

      await expect(
        service.update({
          projectId,
          ruleId: rule.id,
          evaluatorMappings: [],
        }),
      ).resolves.toMatchObject({ enabled: false, assignments: [] });
    });

    it("applies enabled in the same call as other changes", async () => {
      const service = createService();
      const rule = await service.create(createInput(), null);

      await expect(
        service.update({
          projectId,
          ruleId: rule.id,
          name: "Renamed and disabled",
          enabled: false,
        }),
      ).resolves.toMatchObject({
        name: "Renamed and disabled",
        enabled: false,
      });
    });
  });

  describe("detach", () => {
    it("disables the rule when the last evaluator is detached", async () => {
      const evaluator = await createEvaluator();
      const service = createService();
      const rule = await service.create(createInput(evaluator.id), null);

      await expect(
        service.detach({
          projectId,
          ruleId: rule.id,
          evaluatorId: evaluator.id,
        }),
      ).resolves.toMatchObject({ enabled: false, assignments: [] });
    });

    it("keeps the rule enabled when another evaluator remains", async () => {
      const [first, second] = await Promise.all([
        createEvaluator(),
        createEvaluator(),
      ]);
      const service = createService();
      const rule = await service.create(createInput(first.id), null);
      await service.attach({
        projectId,
        ruleId: rule.id,
        assignment: { evaluatorId: second.id, variableMapping: null },
      });

      await expect(
        service.detach({
          projectId,
          ruleId: rule.id,
          evaluatorId: first.id,
        }),
      ).resolves.toMatchObject({
        enabled: true,
        assignments: [expect.objectContaining({ evaluatorId: second.id })],
      });
    });

    it("rejects an unavailable assignment", async () => {
      const service = createService();
      const rule = await service.create(createInput(), null);

      await expect(
        service.detach({
          projectId,
          ruleId: rule.id,
          evaluatorId: "missing-evaluator",
        }),
      ).rejects.toThrow("Assignment not found");
    });
  });

  describe("setEnabled", () => {
    it("updates the rule status", async () => {
      const service = createService();
      const rule = await service.create(createInput(), null);

      await expect(
        service.setEnabled({ projectId, ruleId: rule.id, enabled: false }),
      ).resolves.toMatchObject({ id: rule.id, enabled: false });
    });

    it("rejects an unavailable rule", async () => {
      await expect(
        createService().setEnabled({
          projectId,
          ruleId: "missing-rule",
          enabled: false,
        }),
      ).rejects.toThrow("Evaluation rule not found");
    });
  });

  describe("active rule limit", () => {
    // Fills the project to the cap with bare rows; the guard counts rules, not
    // assignments, so this is the cheapest way to sit exactly at the boundary.
    const fillToCap = async (activeCount: number) =>
      prisma.evaluationRule.createMany({
        data: Array.from({ length: activeCount }, (_, index) => ({
          projectId,
          name: `Filler rule ${index} ${randomUUID()}`,
          status: "ACTIVE" as const,
          targetObject: "event",
          filter: [],
          sampling: 1,
          delay: 0,
          timeScope: ["NEW"],
        })),
      });

    it("rejects creating a rule past the cap", async () => {
      await fillToCap(MAX_ACTIVE_EVALUATION_RULES);

      await expect(createService().create(createInput(), null)).rejects.toThrow(
        /maximum number of active evaluation rules/,
      );
    });

    it("still allows creating a rule one below the cap", async () => {
      await fillToCap(MAX_ACTIVE_EVALUATION_RULES - 1);

      await expect(
        createService().create(createInput(), null),
      ).resolves.toMatchObject({ enabled: true });
    });

    it("rejects re-enabling a rule past the cap", async () => {
      const service = createService();
      const rule = await service.create(createInput(), null);
      await service.setEnabled({ projectId, ruleId: rule.id, enabled: false });
      await fillToCap(MAX_ACTIVE_EVALUATION_RULES);

      await expect(
        service.setEnabled({ projectId, ruleId: rule.id, enabled: true }),
      ).rejects.toThrow(/maximum number of active evaluation rules/);
    });

    it("does not re-check the cap for a rule that is already active", async () => {
      const service = createService();
      const rule = await service.create(createInput(), null);
      await fillToCap(MAX_ACTIVE_EVALUATION_RULES);

      await expect(
        service.setEnabled({ projectId, ruleId: rule.id, enabled: true }),
      ).resolves.toMatchObject({ id: rule.id, enabled: true });
    });

    it("counts every rule a bulk enable would activate", async () => {
      const service = createService();
      const first = await service.create(createInput(), null);
      const second = await service.create(
        { ...createInput(), name: "Second bulk rule" },
        null,
      );
      await service.setManyEnabled({
        projectId,
        ruleIds: [first.id, second.id],
        enabled: false,
      });
      await fillToCap(MAX_ACTIVE_EVALUATION_RULES - 1);

      await expect(
        service.setManyEnabled({
          projectId,
          ruleIds: [first.id, second.id],
          enabled: true,
        }),
      ).rejects.toThrow(/maximum number of active evaluation rules/);
    });
  });

  describe("setManyEnabled", () => {
    it("updates filtered matches without crossing project boundaries", async () => {
      const service = createService();
      const first = await service.create(createInput(), null);
      const second = await service.create(
        { ...createInput(), name: "Other production rule" },
        null,
      );
      await createService().create(
        {
          ...createInput(),
          projectId: otherProjectId,
          name: "Foreign production rule",
        },
        null,
      );

      const changedIds = await service.setManyEnabled({
        projectId,
        isBatchAction: true,
        search: "production",
        enabled: false,
      });

      expect(new Set(changedIds)).toEqual(new Set([first.id, second.id]));
      await expect(
        service.list({ projectId, page: 1, limit: 50, enabled: false }),
      ).resolves.toMatchObject({ totalItems: 2 });
    });
  });

  describe("delete", () => {
    it("deletes a rule", async () => {
      const service = createService();
      const rule = await service.create(createInput(), null);

      await expect(service.delete(projectId, rule.id)).resolves.toBeUndefined();
      await expect(service.get(projectId, rule.id)).rejects.toThrow(
        "Evaluation rule not found",
      );
    });

    it("rejects an unavailable rule", async () => {
      await expect(
        createService().delete(projectId, "missing-rule"),
      ).rejects.toThrow("Evaluation rule not found");
    });
  });

  describe("deleteMany", () => {
    it("deletes an explicit selection", async () => {
      const service = createService();
      const first = await service.create(createInput(), null);
      const second = await service.create(
        { ...createInput(), name: "Second rule" },
        null,
      );

      await expect(
        service.deleteMany({ projectId, ruleIds: [first.id, second.id] }),
      ).resolves.toEqual(expect.arrayContaining([first.id, second.id]));
      await expect(
        service.list({ projectId, page: 1, limit: 50 }),
      ).resolves.toEqual({ rules: [], totalItems: 0 });
    });

    it("ignores unavailable rules in an explicit selection", async () => {
      const service = createService();
      const local = await service.create(createInput(), null);
      const foreign = await createService().create(
        {
          ...createInput(),
          projectId: otherProjectId,
          name: "Foreign rule",
        },
        null,
      );

      await expect(
        service.deleteMany({
          projectId,
          ruleIds: [local.id, foreign.id],
        }),
      ).resolves.toEqual([local.id]);
      await expect(service.get(projectId, local.id)).rejects.toThrow(
        "Evaluation rule not found",
      );
      await expect(
        createService().get(otherProjectId, foreign.id),
      ).resolves.toMatchObject({ id: foreign.id });
    });
  });

  it("audits successful rule mutations", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = createService(audit);
    const [firstEvaluator, secondEvaluator] = await Promise.all([
      createEvaluator(),
      createEvaluator(),
    ]);
    const rule = await service.create(createInput(firstEvaluator.id), null);

    await service.update({
      projectId,
      ruleId: rule.id,
      name: "Audited rule update",
    });
    await service.setEnabled({
      projectId,
      ruleId: rule.id,
      enabled: false,
    });
    await service.attach({
      projectId,
      ruleId: rule.id,
      assignment: {
        evaluatorId: secondEvaluator.id,
        variableMapping: null,
      },
    });
    await service.update({
      projectId,
      ruleId: rule.id,
      evaluatorMappings: [
        {
          evaluatorId: secondEvaluator.id,
          variableMapping: [
            { templateVariable: "output", selectedColumnId: "input" },
          ],
        },
      ],
    });
    await service.detach({
      projectId,
      ruleId: rule.id,
      evaluatorId: secondEvaluator.id,
    });
    await service.setManyEnabled({
      projectId,
      ruleIds: [rule.id],
      enabled: true,
    });
    await service.deleteMany({ projectId, ruleIds: [rule.id] });

    const explicitlyDeleted = await service.create(
      { ...createInput(), name: "Explicitly deleted rule" },
      null,
    );
    await service.delete(projectId, explicitlyDeleted.id);

    expect(audit.mock.calls.map(([event]) => event)).toEqual([
      { action: "create", projectId, ruleId: rule.id },
      { action: "update", projectId, ruleId: rule.id },
      { action: "update", projectId, ruleId: rule.id },
      { action: "update", projectId, ruleId: rule.id },
      { action: "update", projectId, ruleId: rule.id },
      { action: "update", projectId, ruleId: rule.id },
      { action: "update", projectId, ruleId: rule.id },
      { action: "delete", projectId, ruleId: rule.id },
      { action: "create", projectId, ruleId: explicitlyDeleted.id },
      { action: "delete", projectId, ruleId: explicitlyDeleted.id },
    ]);
  });
});
