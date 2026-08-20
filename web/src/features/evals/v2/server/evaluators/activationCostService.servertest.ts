import { EvalTemplateType } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type * as SharedServer from "@langfuse/shared/src/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findEvaluatorsByIds: vi.fn(),
  getObservationsCountFromEventsTable: vi.fn(),
  getObservationsWithModelDataFromEventsTable: vi.fn(),
  getLatestEvaluatorRunCost: vi.fn(),
  testEvaluator: vi.fn(),
}));

vi.mock("./evaluatorRepository", () => ({
  findEvaluatorsByIds: mocks.findEvaluatorsByIds,
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServer>()),
  getObservationsCountFromEventsTable:
    mocks.getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable:
    mocks.getObservationsWithModelDataFromEventsTable,
  getLatestEvaluatorRunCost: mocks.getLatestEvaluatorRunCost,
}));

vi.mock("./testEvaluator", () => ({
  testEvaluator: mocks.testEvaluator,
}));

import { getActivationCostEstimates } from "./activationCostService";

const evaluator = {
  id: "evaluator-id",
  type: EvalTemplateType.LLM_AS_JUDGE,
  versions: [
    {
      prompt: "Judge {{output}}",
      provider: null,
      model: null,
      modelParams: null,
      vars: ["output"],
      variableMapping: [
        { templateVariable: "output", selectedColumnId: "output" },
      ],
      outputDefinition: {
        scoreType: "NUMERIC",
        range: { min: 0, max: 1 },
      },
      sourceCode: null,
      sourceCodeLanguage: null,
    },
  ],
};

describe("getActivationCostEstimates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T08:00:00.000Z"));
    mocks.findEvaluatorsByIds.mockResolvedValue([evaluator]);
    mocks.getObservationsCountFromEventsTable.mockResolvedValue(700);
    mocks.getObservationsWithModelDataFromEventsTable.mockResolvedValue([
      {
        id: "observation-id",
        traceId: "trace-id",
        startTime: new Date("2026-08-11T12:00:00.000Z"),
      },
    ]);
    mocks.getLatestEvaluatorRunCost.mockResolvedValue(0.02);
    mocks.testEvaluator.mockResolvedValue({
      success: true,
      executionTraceId: "execution-trace-id",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scopes reads to the project and estimates the sampled seven-day total", async () => {
    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id"],
      filter: [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ],
      sampling: 0.25,
      shouldReadFromObservationsTable: false,
    });

    expect(mocks.findEvaluatorsByIds).toHaveBeenCalledOnce();
    expect(mocks.findEvaluatorsByIds.mock.calls[0]?.[0].prisma).toBe(prisma);
    expect(mocks.findEvaluatorsByIds.mock.calls[0]?.[0]).toMatchObject({
      projectId: "project-id",
      evaluatorIds: ["evaluator-id"],
    });
    expect(mocks.getObservationsCountFromEventsTable).toHaveBeenCalledWith({
      projectId: "project-id",
      filter: [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: new Date("2026-08-05T08:00:00.000Z"),
        },
      ],
      limit: 1,
      offset: 0,
    });
    expect(mocks.getLatestEvaluatorRunCost).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        evaluatorId: "evaluator-id",
        matchingObservations: 700,
        sampling: 0.25,
        testRunCostUsd: 0.02,
        estimatedCostUsd: 3.5,
      },
    ]);
  });

  it("loads evaluators and counts matching observations once for the batch", async () => {
    mocks.findEvaluatorsByIds.mockResolvedValue([
      evaluator,
      { ...evaluator, id: "second-evaluator-id" },
    ]);
    mocks.getLatestEvaluatorRunCost.mockImplementation(
      async (_projectId, evaluatorId) =>
        evaluatorId === "evaluator-id" ? 0.02 : 0.04,
    );

    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id", "second-evaluator-id"],
      filter: [],
      sampling: 0.5,
      shouldReadFromObservationsTable: false,
    });

    expect(mocks.findEvaluatorsByIds).toHaveBeenCalledOnce();
    expect(mocks.getObservationsCountFromEventsTable).toHaveBeenCalledOnce();
    expect(mocks.getLatestEvaluatorRunCost).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      expect.objectContaining({
        evaluatorId: "evaluator-id",
        estimatedCostUsd: 7,
      }),
      expect.objectContaining({
        evaluatorId: "second-evaluator-id",
        estimatedCostUsd: 14,
      }),
    ]);
  });

  it("uses the latest recent evaluator trace cost without doing a test run", async () => {
    mocks.getLatestEvaluatorRunCost.mockResolvedValue(0.015);

    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id"],
      filter: [],
      sampling: 0.5,
      knownTestRunCostUsd: 0.03,
      shouldReadFromObservationsTable: false,
    });

    expect(mocks.getLatestEvaluatorRunCost).toHaveBeenCalledWith(
      "project-id",
      "evaluator-id",
    );
    expect(mocks.testEvaluator).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      testRunCostUsd: 0.015,
      estimatedCostUsd: 5.25,
    });
  });

  it("returns zero cost for code evaluators in a mixed batch", async () => {
    const codeEvaluator = {
      ...evaluator,
      id: "code-evaluator-id",
      type: EvalTemplateType.CODE,
    };
    mocks.findEvaluatorsByIds.mockResolvedValue([evaluator, codeEvaluator]);

    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id", "code-evaluator-id"],
      filter: [],
      sampling: 0.5,
      shouldReadFromObservationsTable: false,
    });

    expect(mocks.getLatestEvaluatorRunCost).toHaveBeenCalledOnce();
    expect(mocks.getLatestEvaluatorRunCost).toHaveBeenCalledWith(
      "project-id",
      "evaluator-id",
    );
    expect(result).toEqual([
      expect.objectContaining({
        evaluatorId: "evaluator-id",
        testRunCostUsd: 0.02,
        estimatedCostUsd: 7,
      }),
      expect.objectContaining({
        evaluatorId: "code-evaluator-id",
        testRunCostUsd: 0,
        estimatedCostUsd: 0,
      }),
    ]);
  });

  it("runs the evaluator on the newest match when no recent trace cost exists", async () => {
    mocks.getLatestEvaluatorRunCost
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(0.03);

    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id"],
      filter: [],
      sampling: 1,
      shouldReadFromObservationsTable: false,
    });

    expect(mocks.testEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-id",
        projectId: "project-id",
        evaluatorId: "evaluator-id",
        observationId: "observation-id",
        traceId: "trace-id",
        startTime: new Date("2026-08-11T12:00:00.000Z"),
        shouldReadFromObservationsTable: false,
      }),
    );
    expect(result[0]?.testRunCostUsd).toBe(0.03);
    expect(result[0]?.estimatedCostUsd).toBe(21);
  });

  it("does not repeat a missing-cost test when the caller already requested one", async () => {
    mocks.getLatestEvaluatorRunCost
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(0.02);

    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id"],
      filter: [],
      sampling: 1,
      shouldReadFromObservationsTable: false,
      shouldRunMissingTest: false,
    });

    expect(mocks.testEvaluator).not.toHaveBeenCalled();
    expect(result[0]?.testRunCostUsd).toBe(0.02);
  });

  it("uses a known test cost when no recent trace is indexed yet", async () => {
    mocks.getLatestEvaluatorRunCost.mockResolvedValue(null);

    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id"],
      filter: [],
      sampling: 0.5,
      knownTestRunCostUsd: 0.03,
      shouldRunMissingTest: false,
      shouldReadFromObservationsTable: false,
    });

    expect(mocks.getLatestEvaluatorRunCost).toHaveBeenCalledOnce();
    expect(mocks.testEvaluator).not.toHaveBeenCalled();
    expect(result[0]?.estimatedCostUsd).toBe(10.5);
  });

  it("shares the newest match and runs missing cost probes concurrently", async () => {
    mocks.findEvaluatorsByIds.mockResolvedValue([
      evaluator,
      { ...evaluator, id: "second-evaluator-id" },
    ]);
    const costReads = new Map<string, number>();
    mocks.getLatestEvaluatorRunCost.mockImplementation(
      async (_projectId, evaluatorId) => {
        const readCount = (costReads.get(evaluatorId) ?? 0) + 1;
        costReads.set(evaluatorId, readCount);
        return readCount === 1 ? null : 0.03;
      },
    );
    let activeTests = 0;
    let maxActiveTests = 0;
    mocks.testEvaluator.mockImplementation(async () => {
      activeTests += 1;
      maxActiveTests = Math.max(maxActiveTests, activeTests);
      await Promise.resolve();
      activeTests -= 1;
      return { success: true, executionTraceId: "execution-trace-id" };
    });

    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id", "second-evaluator-id"],
      filter: [],
      sampling: 1,
      shouldReadFromObservationsTable: false,
    });

    expect(
      mocks.getObservationsWithModelDataFromEventsTable,
    ).toHaveBeenCalledOnce();
    expect(mocks.testEvaluator).toHaveBeenCalledTimes(2);
    expect(maxActiveTests).toBe(2);
    expect(result.map(({ testRunCostUsd }) => testRunCostUsd)).toEqual([
      0.03, 0.03,
    ]);
  });

  it("does not run a test when the rule has no matching observation", async () => {
    mocks.getObservationsCountFromEventsTable.mockResolvedValue(0);
    mocks.getLatestEvaluatorRunCost.mockResolvedValue(null);

    const result = await getActivationCostEstimates({
      orgId: "org-id",
      projectId: "project-id",
      evaluatorIds: ["evaluator-id"],
      filter: [],
      sampling: 1,
      shouldReadFromObservationsTable: false,
    });

    expect(mocks.testEvaluator).not.toHaveBeenCalled();
    expect(result[0]?.testRunCostUsd).toBeNull();
    expect(result[0]?.estimatedCostUsd).toBeNull();
  });
});
