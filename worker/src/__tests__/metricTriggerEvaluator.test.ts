import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { v4 } from "uuid";
import { JobConfigState, TriggerEventSource } from "@langfuse/shared";
import {
  createOrgProjectAndApiKey,
  getTotalCostForWindow,
  getFailureRateForWindow,
  getP99LatencyForWindow,
  getAvgScoreForWindow,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { ActionType } from "@langfuse/shared/src/db";
import {
  evaluateAllMetricTriggers,
  compareMetricForTesting,
} from "../features/metricTriggers/metricTriggerEvaluator";

// Mock ClickHouse metric functions and the WebhookQueue (avoids Redis connection)
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    getTotalCostForWindow: vi.fn(),
    getFailureRateForWindow: vi.fn(),
    getP99LatencyForWindow: vi.fn(),
    getAvgScoreForWindow: vi.fn(),
    WebhookQueue: {
      getInstance: vi.fn(() => ({
        add: vi.fn().mockResolvedValue(undefined),
      })),
    },
  };
});

// Helper: create a full automation with metric trigger in the DB
async function createMetricAutomation({
  projectId,
  metric = "total_cost_usd",
  operator = ">=",
  threshold = 0,
  lookbackWindowMinutes = 60,
  cooldownMinutes = 1,
  lastTriggeredAt = null,
}: {
  projectId: string;
  metric?: string;
  operator?: string;
  threshold?: number;
  lookbackWindowMinutes?: number;
  cooldownMinutes?: number;
  lastTriggeredAt?: Date | null;
}) {
  const triggerId = v4();
  const actionId = v4();
  const automationId = v4();

  await prisma.trigger.create({
    data: {
      id: triggerId,
      projectId,
      eventSource: TriggerEventSource.TraceMetric,
      eventActions: [],
      filter: {
        metric,
        operator,
        threshold,
        lookbackWindowMinutes,
        cooldownMinutes,
      },
      status: JobConfigState.ACTIVE,
      lastTriggeredAt: lastTriggeredAt,
    },
  });

  await prisma.action.create({
    data: {
      id: actionId,
      projectId,
      type: ActionType.WEBHOOK,
      config: {
        type: "WEBHOOK",
        url: "https://webhook.example.com/test",
        requestHeaders: {},
        headers: {},
        displayHeaders: {},
        apiVersion: { prompt: "v1" },
        secretKey: "dummy-encrypted-secret",
        displaySecretKey: "****test",
      },
    },
  });

  await prisma.automation.create({
    data: {
      id: automationId,
      name: "TEST: metric-trigger",
      projectId,
      triggerId,
      actionId,
    },
  });

  return { triggerId, actionId, automationId };
}

describe("compareMetric", () => {
  it("evaluates > correctly", () => {
    expect(compareMetricForTesting(1, ">", 0)).toBe(true);
    expect(compareMetricForTesting(0, ">", 0)).toBe(false);
    expect(compareMetricForTesting(-1, ">", 0)).toBe(false);
  });

  it("evaluates >= correctly", () => {
    expect(compareMetricForTesting(0, ">=", 0)).toBe(true);
    expect(compareMetricForTesting(1, ">=", 0)).toBe(true);
    expect(compareMetricForTesting(-1, ">=", 0)).toBe(false);
  });

  it("evaluates < correctly", () => {
    expect(compareMetricForTesting(-1, "<", 0)).toBe(true);
    expect(compareMetricForTesting(0, "<", 0)).toBe(false);
    expect(compareMetricForTesting(1, "<", 0)).toBe(false);
  });

  it("evaluates <= correctly", () => {
    expect(compareMetricForTesting(0, "<=", 0)).toBe(true);
    expect(compareMetricForTesting(-1, "<=", 0)).toBe(true);
    expect(compareMetricForTesting(1, "<=", 0)).toBe(false);
  });

  it("returns false for unknown operator", () => {
    expect(compareMetricForTesting(1, "!=", 0)).toBe(false);
  });
});

describe("evaluateAllMetricTriggers", () => {
  let projectId: string;

  beforeEach(async () => {
    const result = await createOrgProjectAndApiKey();
    projectId = result.projectId;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await prisma.automation.deleteMany({ where: { projectId } });
    await prisma.trigger.deleteMany({ where: { projectId } });
    await prisma.action.deleteMany({ where: { projectId } });
    await prisma.automationExecution.deleteMany({ where: { projectId } });
  });

  it("does nothing when no active metric triggers exist", async () => {
    // No triggers created — should complete without error
    await expect(evaluateAllMetricTriggers()).resolves.not.toThrow();
    expect(getTotalCostForWindow).not.toHaveBeenCalled();
  });

  it("creates an AutomationExecution and enqueues a job when condition is breached", async () => {
    vi.mocked(getTotalCostForWindow).mockResolvedValue(5.5);

    const { triggerId, actionId } = await createMetricAutomation({
      projectId,
      metric: "total_cost_usd",
      operator: ">=",
      threshold: 5,
    });

    await evaluateAllMetricTriggers();

    const executions = await prisma.automationExecution.findMany({
      where: { projectId, triggerId, actionId },
    });
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe("PENDING");
    expect(executions[0].input).toMatchObject({
      metric: "total_cost_usd",
      value: 5.5,
      operator: ">=",
      threshold: 5,
    });
  });

  it("does not create an execution when condition is not met", async () => {
    vi.mocked(getTotalCostForWindow).mockResolvedValue(3.0);

    const { triggerId, actionId } = await createMetricAutomation({
      projectId,
      metric: "total_cost_usd",
      operator: ">=",
      threshold: 5,
    });

    await evaluateAllMetricTriggers();

    const executions = await prisma.automationExecution.findMany({
      where: { projectId, triggerId, actionId },
    });
    expect(executions).toHaveLength(0);
  });

  it("respects cooldown — skips trigger when fired recently", async () => {
    vi.mocked(getTotalCostForWindow).mockResolvedValue(10);

    const recentlyFired = new Date(Date.now() - 30 * 1000); // 30 seconds ago
    const { triggerId, actionId } = await createMetricAutomation({
      projectId,
      metric: "total_cost_usd",
      operator: ">=",
      threshold: 0,
      cooldownMinutes: 1,
      lastTriggeredAt: recentlyFired,
    });

    await evaluateAllMetricTriggers();

    const executions = await prisma.automationExecution.findMany({
      where: { projectId, triggerId, actionId },
    });
    expect(executions).toHaveLength(0);
  });

  it("fires after cooldown has elapsed", async () => {
    vi.mocked(getTotalCostForWindow).mockResolvedValue(10);

    const longAgo = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    const { triggerId, actionId } = await createMetricAutomation({
      projectId,
      metric: "total_cost_usd",
      operator: ">=",
      threshold: 0,
      cooldownMinutes: 1,
      lastTriggeredAt: longAgo,
    });

    await evaluateAllMetricTriggers();

    const executions = await prisma.automationExecution.findMany({
      where: { projectId, triggerId, actionId },
    });
    expect(executions).toHaveLength(1);
  });

  it("updates lastTriggeredAt on the trigger after breach", async () => {
    vi.mocked(getTotalCostForWindow).mockResolvedValue(1);

    const before = new Date();
    const { triggerId } = await createMetricAutomation({
      projectId,
      metric: "total_cost_usd",
      operator: ">",
      threshold: 0,
    });

    await evaluateAllMetricTriggers();

    const trigger = await prisma.trigger.findUnique({
      where: { id: triggerId },
    });
    expect(trigger?.lastTriggeredAt).not.toBeNull();
    expect(trigger!.lastTriggeredAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });

  it("routes to the correct metric query function for each metric type", async () => {
    vi.mocked(getFailureRateForWindow).mockResolvedValue(0.5);
    await createMetricAutomation({
      projectId,
      metric: "failure_rate",
      operator: ">",
      threshold: 0.1,
    });

    await evaluateAllMetricTriggers();
    expect(getFailureRateForWindow).toHaveBeenCalledWith({
      projectId,
      lookbackWindowMinutes: 60,
    });
  });

  it("skips trigger with invalid filter (non-MetricCondition)", async () => {
    // Insert a trigger with a bad filter directly
    await prisma.trigger.create({
      data: {
        id: v4(),
        projectId,
        eventSource: TriggerEventSource.TraceMetric,
        eventActions: [],
        filter: [{ this: "is not a MetricCondition" }], // invalid
        status: JobConfigState.ACTIVE,
      },
    });

    // Should not throw, just skip
    await expect(evaluateAllMetricTriggers()).resolves.not.toThrow();
    expect(getTotalCostForWindow).not.toHaveBeenCalled();
  });
});
