import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicCostEstimateView } from "./TopicCostEstimateView";
import { costEstimateFixture as estimate } from "./topicCostEstimateFixture";

const meta = preview.meta({
  component: TopicCostEstimateView,
  args: {
    estimate: null,
    samplingPercent: 100,
    backfillTraces: 500,
    restartInMinutes: null,
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

// A finished estimate is reused for the same inputs, so restarting waits for the cooldown.
export const RecentlyEstimated = meta.story({
  args: { estimate: estimate(), restartInMinutes: 12 },
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
