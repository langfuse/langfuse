import { beforeEach, describe, expect, it, vi } from "vitest";
import { observationForEvalSchema, type FilterState } from "@langfuse/shared";
import { getDeterministicSamplingValue } from "../evaluation/deterministicSampling";
import {
  fetchTraceBatchRules,
  getMatchingTraceBatchRuleIds,
  type TraceBatchRule,
} from "./traceBatchRules";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), active: vi.fn() }));
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { evaluationRule: { findMany: mocks.findMany } },
}));
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  isTopicsProcessingActive: mocks.active,
}));

const observation = (overrides: Record<string, unknown> = {}) =>
  observationForEvalSchema.parse({
    project_id: "project",
    trace_id: "trace",
    span_id: "span",
    parent_span_id: "root",
    type: "GENERATION",
    name: "answer",
    environment: "production",
    level: "ERROR",
    provided_usage_details: {},
    provided_cost_details: {},
    usage_details: {},
    cost_details: {},
    ...overrides,
  });
const rule = (
  filter: FilterState = [],
  id = "rule-a",
  sampling = 1,
): TraceBatchRule => ({
  id,
  projectId: "project",
  filter,
  sampling,
});

describe("trace batch rule admission", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.active.mockResolvedValue(true);
  });

  it("requires all conditions on one span, including optional root and experiment predicates", () => {
    const filters: FilterState = [
      { column: "sessionId", type: "string", operator: "=", value: "session" },
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "source",
        operator: "=",
        value: "agent",
      },
      {
        column: "experimentDatasetId",
        type: "stringOptions",
        operator: "any of",
        value: ["dataset"],
      },
    ];
    const matching = observation({
      session_id: "session",
      metadata: { source: "agent" },
      experiment_dataset_id: "dataset",
    });
    expect(getMatchingTraceBatchRuleIds(matching, [rule(filters)])).toEqual([
      "rule-a",
    ]);
    expect(
      getMatchingTraceBatchRuleIds({ ...matching, level: "DEFAULT" }, [
        rule(filters),
      ]),
    ).toEqual([]);
    expect(
      getMatchingTraceBatchRuleIds({ ...matching, session_id: null }, [
        rule(filters),
      ]),
    ).toEqual([]);
    const rootRule = rule([
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ]);
    expect(getMatchingTraceBatchRuleIds(matching, [rootRule])).toEqual([]);
    expect(
      getMatchingTraceBatchRuleIds({ ...matching, parent_span_id: null }, [
        rootRule,
      ]),
    ).toEqual(["rule-a"]);
    expect(
      getMatchingTraceBatchRuleIds({ ...matching, is_app_root: true }, [
        rootRule,
      ]),
    ).toEqual(["rule-a"]);
  });

  it("samples once per project/trace/rule independently of the matching span", () => {
    const samples = ["rule-a", "rule-b"].map((id) =>
      getDeterministicSamplingValue(JSON.stringify(["project", "trace", id])),
    );
    const rate = (samples[0] + samples[1]) / 2;
    const rules = [rule([], "rule-a", rate), rule([], "rule-b", rate)];
    const selected = getMatchingTraceBatchRuleIds(observation(), rules);
    expect(selected).toEqual([samples[0] < samples[1] ? "rule-a" : "rule-b"]);
    expect(
      getMatchingTraceBatchRuleIds(
        observation({ span_id: "another-span" }),
        rules,
      ),
    ).toEqual(selected);
    expect(
      getMatchingTraceBatchRuleIds(observation(), [
        rule([], "zero", 0),
        rule([], "all", 1),
      ]),
    ).toEqual(["all"]);
  });

  it("excludes foreign projects and evaluation-generated telemetry", () => {
    expect(
      getMatchingTraceBatchRuleIds(observation({ project_id: "foreign" }), [
        rule(),
      ]),
    ).toEqual([]);
    expect(
      getMatchingTraceBatchRuleIds(
        observation({ environment: "langfuse-llm-as-a-judge" }),
        [rule()],
      ),
    ).toEqual([]);
  });

  it("matches accepted string-options tag filters against observations with multiple tags", async () => {
    mocks.findMany.mockResolvedValue([
      rule([
        {
          column: "tags",
          type: "stringOptions",
          operator: "any of",
          value: ["billing"],
        },
      ]),
    ]);
    const rules = (await fetchTraceBatchRules("project"))!;
    expect(
      getMatchingTraceBatchRuleIds(
        observation({ tags: ["billing", "paid"] }),
        rules,
      ),
    ).toEqual(["rule-a"]);
    expect(
      getMatchingTraceBatchRuleIds(observation({ tags: ["paid"] }), rules),
    ).toEqual([]);
  });

  it("validates persisted filters without turning unsupported rules into match-all", async () => {
    mocks.findMany.mockResolvedValue([
      rule([
        {
          column: "Status",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
      ]),
      rule(
        [
          {
            column: "level",
            type: "stringOptions",
            operator: "none of",
            value: ["ERROR"],
          },
        ],
        "negative",
      ),
      rule(
        [{ column: "totalCost", type: "number", operator: ">", value: 1 }],
        "aggregate",
      ),
    ]);
    const rules = await fetchTraceBatchRules("project");
    expect(rules?.map(({ id }) => id)).toEqual(["rule-a"]);
    expect(getMatchingTraceBatchRuleIds(observation(), rules!)).toEqual([
      "rule-a",
    ]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({
              projectId: "project",
              targetObject: { in: ["trace", "trace_transcript"] },
            }),
            expect.objectContaining({
              status: "ACTIVE",
              assignments: {
                some: {
                  projectId: "project",
                  evaluator: {
                    projectId: "project",
                    type: "FACET",
                    blockedAt: null,
                  },
                },
              },
            }),
          ],
        },
      }),
    );
    mocks.findMany.mockClear();
    mocks.active.mockResolvedValue(false);
    expect(await fetchTraceBatchRules("project")).toBeUndefined();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
