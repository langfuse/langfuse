import { expect, fn, userEvent, within } from "storybook/test";
import type { TopicCostEstimate } from "@langfuse/shared/topics";
import preview from "../../../.storybook/preview";
import { TopicCostEstimateView } from "./TopicCostEstimateView";

const estimate = (
  overrides: Partial<TopicCostEstimate> = {},
  perTraceUsd: number | null = 0.0042,
) => ({
  key: "0123456789abcdef0123456789abcdef",
  runId: "run-1",
  status: "done" as const,
  startedAt: 0,
  finishedAt: 1_000,
  error: null,
  inputs: {
    filter: [],
    facets: [{ facetId: "intent", version: 1 }],
    summaryModel: "gpt-5.6-luna",
    embeddingModel: "text-embedding-3-small",
  },
  finishedTraces7d: 6_677,
  sampled: 50,
  processed: 50,
  summarizable: 50,
  skipped: { tooLarge: 0, noContent: 0 },
  tokens: {
    prefixTokens: 50 * 2_400,
    inputTokens: 50 * 1_800,
    outputTokens: 50 * 120,
    embeddingTokens: 50 * 80,
  },
  traceNames: [],
  ...overrides,
  prices: {
    perTraceUsd,
    summaryPriced: perTraceUsd !== null,
    embeddingPriced: true,
  },
});

const meta = preview.meta({
  component: TopicCostEstimateView,
  args: {
    estimate: null,
    samplingPercent: 100,
    backfillTraces: 500,
    modelSettingsHref: "/project/demo/settings/models",
    starting: false,
    disabled: false,
    error: null,
    onStart: fn(),
  },
});

export const NotStarted = meta.story({});

// No question is selected yet, so there is nothing to estimate.
export const Disabled = meta.story({ args: { disabled: true } });

export const Starting = meta.story({ args: { starting: true } });

export const PickingTraces = meta.story({
  args: {
    estimate: estimate({
      status: "running",
      finishedAt: null,
      finishedTraces7d: null,
      sampled: 0,
      processed: 0,
      summarizable: 0,
    }),
  },
});

// Fewer than 10 traces measured: progress only, no cost yet.
export const MeasuringTraces = meta.story({
  args: {
    estimate: estimate({
      status: "running",
      finishedAt: null,
      processed: 6,
      summarizable: 6,
    }),
  },
});

export const PartialCost = meta.story({
  args: {
    estimate: estimate({
      status: "running",
      finishedAt: null,
      processed: 27,
      summarizable: 27,
    }),
  },
});

export const Done = meta.story({ args: { estimate: estimate() } });

export const DoneWithSkippedTraces = meta.story({
  args: {
    estimate: estimate({
      summarizable: 44,
      skipped: { tooLarge: 2, noContent: 4 },
    }),
  },
});

// Sampling scales only the daily cost on read; the backfill part is hidden without a backfill.
export const SampledWithoutBackfill = meta.story({
  args: {
    estimate: estimate(),
    samplingPercent: 10,
    backfillTraces: null,
  },
});

export const NoMatchingTraces = meta.story({
  args: {
    estimate: estimate({
      finishedTraces7d: 0,
      sampled: 0,
      processed: 0,
      summarizable: 0,
    }),
  },
});

export const UnpricedModel = meta.story({
  args: {
    estimate: estimate(
      { inputs: { ...estimate().inputs, summaryModel: "my-custom-model" } },
      null,
    ),
  },
});

export const Failed = meta.story({
  args: {
    estimate: estimate({
      status: "failed",
      error: "None of the selected questions exist anymore.",
      processed: 0,
      summarizable: 0,
    }),
  },
});

export const StartRejected = meta.story({
  args: {
    error:
      "Another cost estimate is running for this project. Try again in a minute.",
  },
});

export const LabelsEstimate = meta.story({
  name: "(Test) Shows approximate costs per trace and per 1k traces and starts again",
  args: { estimate: estimate() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("~$0.0042")).toBeVisible();
    await expect(canvas.getByText("~$4.20")).toBeVisible();
    await expect(canvas.getByText(/per day at 100% sampling/)).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Estimate again" }),
    );
    await expect(args.onStart).toHaveBeenCalled();
  },
});
