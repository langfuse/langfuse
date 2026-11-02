import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EvalTargetObject,
  EvalTemplateType,
  JobConfigState,
  TopicsTargetObject,
} from "@langfuse/shared";
import { fetchEvalRules } from "../fetchEvalRules";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  hasNoRules: vi.fn(),
  setNoRules: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { evaluationRule: { findMany: mocks.findMany } },
}));
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { debug: vi.fn() },
  hasNoEvalConfigsCache: mocks.hasNoRules,
  setNoEvalConfigsCache: mocks.setNoRules,
}));

const projectId = "project";
const rule = (
  id: string,
  targetObject: string,
  evaluatorTypes: string[] = [EvalTemplateType.LLM_AS_JUDGE],
) => ({
  id,
  projectId,
  filter: [],
  sampling: 1,
  status: JobConfigState.ACTIVE,
  targetObject,
  assignments: evaluatorTypes.map((type, index) => ({
    id: `${id}-assignment-${index}`,
    evaluatorId: `${id}-evaluator-${index}`,
    variableMapping: null,
    evaluator: { id: `${id}-evaluator-${index}`, projectId, type },
  })),
});

describe("evaluation rule fetching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasNoRules.mockResolvedValue(false);
    mocks.setNoRules.mockResolvedValue(undefined);
    mocks.findMany.mockResolvedValue([]);
  });

  it("keeps observation-only fetches on the existing negative cache without touching transcript rules", async () => {
    await fetchEvalRules(projectId);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.findMany.mock.calls[0][0].where.OR).toEqual([
      expect.objectContaining({
        targetObject: {
          in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
        },
      }),
    ]);
    expect(mocks.setNoRules).toHaveBeenCalledExactlyOnceWith(
      projectId,
      "eventBased",
    );

    mocks.hasNoRules.mockImplementation(
      async (_projectId, scope) => scope === "eventBased",
    );
    mocks.findMany.mockResolvedValue([rule("transcript", TopicsTargetObject)]);
    expect(await fetchEvalRules(projectId)).toEqual({
      observationRules: [],
      traceTranscriptRules: [],
    });
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.hasNoRules.mock.calls).toEqual([
      [projectId, "eventBased"],
      [projectId, "eventBased"],
    ]);
  });

  it("fetches both targets once and keeps transcript rules and facet assignments out of observation scheduling", async () => {
    const transcript = rule("transcript", TopicsTargetObject, [
      EvalTemplateType.FACET,
      EvalTemplateType.CODE,
    ]);
    mocks.findMany.mockResolvedValue([
      rule("event", EvalTargetObject.EVENT, [
        EvalTemplateType.LLM_AS_JUDGE,
        EvalTemplateType.FACET,
      ]),
      rule("experiment", EvalTargetObject.EXPERIMENT),
      transcript,
    ]);

    const result = await fetchEvalRules(projectId, {
      includeTraceTranscriptRules: true,
    });

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(
      result.observationRules.map(({ id, targetObject }) => ({
        id,
        targetObject,
      })),
    ).toEqual([
      { id: "event", targetObject: EvalTargetObject.EVENT },
      { id: "experiment", targetObject: EvalTargetObject.EVENT },
    ]);
    expect(result.observationRules[0]).toMatchObject({
      assignments: [{ evaluator: { type: EvalTemplateType.LLM_AS_JUDGE } }],
    });
    expect(result.observationRules[1].filter).toContainEqual({
      column: "isExperimentItemRootSpan",
      type: "boolean",
      operator: "=",
      value: true,
    });
    expect(result.traceTranscriptRules).toEqual([
      { ...transcript, ruleId: transcript.id },
    ]);
    expect(mocks.setNoRules).not.toHaveBeenCalled();

    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where.OR[0].assignments.some.evaluator.type.in).not.toContain(
      EvalTemplateType.FACET,
    );
    expect(query.where.OR[1].assignments.some.evaluator.type.in).toContain(
      EvalTemplateType.FACET,
    );
    expect(query.select.assignments.where.evaluator.type.in).toContain(
      EvalTemplateType.FACET,
    );
    expect(query.where).toMatchObject({
      projectId,
      status: JobConfigState.ACTIVE,
    });
    // Both rule eligibility and the returned assignments enforce tenant scope.
    for (const assignments of [
      ...query.where.OR.map(
        (branch: { assignments: { some: unknown } }) => branch.assignments.some,
      ),
      query.select.assignments.where,
    ]) {
      expect(assignments).toMatchObject({
        projectId,
        evaluator: { projectId, blockedAt: null },
      });
    }
  });

  it.each([
    ["eventBased", TopicsTargetObject, "traceTranscriptRules"],
    ["traceTranscriptBased", EvalTargetObject.EVENT, "observationRules"],
  ] as const)(
    "a cached absence in %s does not hide the other target or refresh its own TTL",
    async (cachedScope, targetObject, resultKey) => {
      mocks.hasNoRules.mockImplementation(
        async (_projectId, scope) => scope === cachedScope,
      );
      mocks.findMany.mockResolvedValue([rule("active", targetObject)]);

      const result = await fetchEvalRules(projectId, {
        includeTraceTranscriptRules: true,
      });
      expect(result[resultKey].map(({ id }) => id)).toEqual(["active"]);
      expect(mocks.findMany).toHaveBeenCalledTimes(1);
      const targets = mocks.findMany.mock.calls[0][0].where.OR;
      expect(targets).toHaveLength(1);
      expect(targets[0].targetObject).toEqual(
        targetObject === TopicsTargetObject
          ? TopicsTargetObject
          : { in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT] },
      );
      expect(mocks.setNoRules).not.toHaveBeenCalled();
    },
  );

  it("caches each empty target and lets existing observation invalidation expose an activated rule", async () => {
    const emptyScopes = new Set<string>();
    mocks.hasNoRules.mockImplementation(async (_projectId, scope) =>
      emptyScopes.has(scope),
    );
    mocks.setNoRules.mockImplementation(async (_projectId, scope) => {
      emptyScopes.add(scope);
    });

    expect(
      await fetchEvalRules(projectId, { includeTraceTranscriptRules: true }),
    ).toEqual({
      observationRules: [],
      traceTranscriptRules: [],
    });
    await fetchEvalRules(projectId, { includeTraceTranscriptRules: true });
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(emptyScopes).toEqual(
      new Set(["eventBased", "traceTranscriptBased"]),
    );

    // An older web instance clears the observation cache when a rule is activated.
    emptyScopes.delete("eventBased");
    mocks.findMany.mockResolvedValue([
      rule("activated", EvalTargetObject.EVENT),
    ]);
    const result = await fetchEvalRules(projectId, {
      includeTraceTranscriptRules: true,
    });
    expect(result.observationRules.map(({ id }) => id)).toEqual(["activated"]);
    expect(result.traceTranscriptRules).toEqual([]);
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(emptyScopes).toEqual(new Set(["traceTranscriptBased"]));
  });

  it("does not cache a failed combined query as an empty project", async () => {
    mocks.findMany.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      fetchEvalRules(projectId, { includeTraceTranscriptRules: true }),
    ).rejects.toThrow("database unavailable");
    expect(mocks.setNoRules).not.toHaveBeenCalled();
  });
});
