import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createEvent,
  createEventsCh,
  recordDistribution,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  claimTopicCostEstimate,
  createTopicFacet,
  markTopicCostEstimateStarted,
  priceTopicCostEstimate,
  readTopicCostEstimate,
} from "@langfuse/shared/topics/server";
import { runTopicCostEstimate } from "./costEstimate";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  recordDistribution: vi.fn(),
}));

const DAY_MS = 86_400_000;

describe("Topics cost estimate", () => {
  const orgId = randomUUID();
  const projectId = randomUUID();

  beforeAll(async () => {
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Topics cost estimate test",
        projects: { create: [{ id: projectId, name: "Topics cost estimate" }] },
      },
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("measures each sampled trace over its whole time span and skips traces without content", async () => {
    const facet = await createTopicFacet({
      projectId,
      name: "Intent",
      description: "",
      prompt: "Describe the request.",
    });
    const now = Date.now();
    const event = (traceId: string, at: number, input: string) =>
      createEvent({
        project_id: projectId,
        trace_id: traceId,
        start_time: new Date(at),
        event_ts: new Date(at),
        input,
        output: "",
      });
    const longTrace = `${projectId}-long`;
    await createEventsCh([
      // One trace whose two events lie two days apart; both must be measured.
      event(longTrace, now - 3 * DAY_MS, "a".repeat(8_000)),
      event(longTrace, now - DAY_MS, "b".repeat(8_000)),
      event(`${projectId}-short`, now - 2 * DAY_MS, "Hello"),
      event(`${projectId}-empty`, now - 2 * DAY_MS, ""),
      // Still active within the idle wait, so not finished.
      event(`${projectId}-active`, now - 60_000, "Hello"),
    ]);

    const { estimate } = await claimTopicCostEstimate({
      projectId,
      filter: [],
      facets: [{ facetId: facet.id, version: 1 }],
      summaryModel: "gpt-5.6-luna",
      embeddingModel: "text-embedding-3-small",
    });
    // Counts left by an attempt that died; a redelivered job must not add to them.
    await markTopicCostEstimateStarted(projectId, {
      ...estimate,
      sampled: 3,
      summarizable: 2,
    });
    await runTopicCostEstimate(projectId, estimate.key, estimate.runId);

    const done = await readTopicCostEstimate(projectId, estimate.key);
    expect(done).toMatchObject({
      status: "done",
      sampled: 3,
      summarizable: 2,
      skipped: { tooLarge: 0, noContent: 1 },
    });
    // 16,000 transcript characters of the long trace at 4 characters per token.
    expect(done!.tokens.inputTokens).toBeGreaterThan(4_000);
    expect(done!.tokens.outputTokens).toBe(2 * 70);
  });

  it("prices a summary model whose price is set on total tokens only", async () => {
    const modelId = randomUUID();
    await prisma.model.create({
      data: {
        id: modelId,
        scope: "PROJECT",
        projectId,
        modelName: "total-priced-model",
        matchPattern: "total-priced-model",
        unit: "TOKENS",
        pricingTiers: {
          create: {
            name: "Standard",
            isDefault: true,
            conditions: [],
            priority: 0,
            prices: {
              createMany: {
                data: [{ modelId, usageType: "total", price: "0.000002" }],
              },
            },
          },
        },
      },
    });
    // Pricing only reads the record, so none is claimed and no lock is left behind.
    const prices = await priceTopicCostEstimate(projectId, {
      key: "key",
      runId: "run",
      status: "done",
      startedAt: 0,
      finishedAt: 0,
      error: null,
      inputs: {
        filter: [],
        facets: [{ facetId: "intent", version: 1 }],
        summaryModel: "total-priced-model",
        embeddingModel: null,
      },
      sampled: 1,
      summarizable: 1,
      skipped: { tooLarge: 0, noContent: 0 },
      tokens: { inputTokens: 1_000, outputTokens: 100, embeddingTokens: 0 },
    });

    // 1,100 total tokens at $0.000002 each.
    expect(prices.summaryPriced).toBe(true);
    expect(prices.perTraceUsd).toBeCloseTo(0.0022);
  });

  it("records each estimate's duration and its cost per 1,000 traces for the project and org", async () => {
    // Its own project, so its trace never enters another test's sample.
    const orgId = randomUUID();
    const projectId = randomUUID();
    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Topics cost estimate metrics test",
        projects: {
          create: [{ id: projectId, name: "Cost estimate metrics" }],
        },
      },
    });
    try {
      const modelId = randomUUID();
      await prisma.model.create({
        data: {
          id: modelId,
          scope: "PROJECT",
          projectId,
          modelName: "estimate-priced-model",
          matchPattern: "estimate-priced-model",
          unit: "TOKENS",
          pricingTiers: {
            create: {
              name: "Standard",
              isDefault: true,
              conditions: [],
              priority: 0,
              prices: {
                createMany: {
                  data: [{ modelId, usageType: "total", price: "0.000002" }],
                },
              },
            },
          },
        },
      });
      const facet = await createTopicFacet({
        projectId,
        name: "Outcome",
        description: "",
        prompt: "Describe the outcome.",
      });
      const at = new Date(Date.now() - DAY_MS);
      await createEventsCh([
        createEvent({
          project_id: projectId,
          trace_id: `${projectId}-priced`,
          start_time: at,
          event_ts: at,
          input: "Export my invoices.",
          output: "",
        }),
      ]);
      const { estimate } = await claimTopicCostEstimate({
        projectId,
        filter: [],
        facets: [{ facetId: facet.id, version: 1 }],
        summaryModel: "estimate-priced-model",
        embeddingModel: null,
      });
      vi.mocked(recordDistribution).mockClear();
      await runTopicCostEstimate(projectId, estimate.key, estimate.runId);

      const tenant = { projectId, orgId };
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.topics.cost_estimate_duration_ms",
        expect.any(Number),
        { ...tenant, outcome: "done", unit: "milliseconds" },
      );
      // The same price the estimate dialog shows, scaled to 1,000 traces.
      const done = await readTopicCostEstimate(projectId, estimate.key);
      const { perTraceUsd } = await priceTopicCostEstimate(projectId, done!);
      expect(perTraceUsd).toBeGreaterThan(0);
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.topics.cost_estimate_per_1000_traces_usd",
        perTraceUsd! * 1000,
        tenant,
      );
    } finally {
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });
});
