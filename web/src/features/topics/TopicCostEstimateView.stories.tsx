import { expect, fn, within } from "storybook/test";
import { TOPICS_COST_ESTIMATE_MAX_FACETS } from "@langfuse/shared/topics";
import preview from "../../../.storybook/preview";
import { TopicCostEstimateView } from "./TopicCostEstimateView";
import { costEstimateFixture as estimate } from "./topicCostEstimateFixture";

const meta = preview.meta({
  component: TopicCostEstimateView,
  args: {
    estimate: null,
    samplingPercent: 100,
    dailyTraces: 954,
    backfillTraces: 500,
    onAddModelPrice: fn(),
    starting: false,
    facetCount: 2,
    error: null,
    onStart: fn(),
  },
});

export const NotStarted = meta.story({});

export const Running = meta.story({
  args: {
    estimate: estimate({
      status: "running",
      finishedAt: null,
      sampled: 0,
      summarizable: 0,
    }),
  },
});

export const Done = meta.story({ args: { estimate: estimate() } });

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
    estimate: estimate({ sampled: 0, summarizable: 0 }),
    dailyTraces: 0,
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

// Without permission to edit model definitions the button stays, disabled.
export const UnpricedModelWithoutPermission = meta.story({
  args: { ...UnpricedModel.input.args, onAddModelPrice: undefined },
});

export const Failed = meta.story({
  args: {
    estimate: estimate({
      status: "failed",
      error: "None of the selected questions exist anymore.",
      sampled: 0,
      summarizable: 0,
    }),
  },
});

export const LabelsEstimate = meta.story({
  name: "(Test) Shows approximate costs per trace and per 1k traces and blocks a repeat",
  args: { estimate: estimate() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("~$0.0042")).toBeVisible();
    await expect(canvas.getByText("~$4.20")).toBeVisible();
    await expect(canvas.getByText(/per day at 100% sampling/)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Estimate cost" }),
    ).toBeDisabled();
  },
});

export const TestOversizedSelection = meta.story({
  name: "(Test) Explains why a large selection cannot be estimated",
  args: { facetCount: TOPICS_COST_ESTIMATE_MAX_FACETS + 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/cost estimates support up to/i),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Estimate cost" }),
    ).not.toBeInTheDocument();
  },
});
