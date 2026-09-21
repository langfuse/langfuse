import { type LastUserScore } from "@langfuse/shared";
import { expect, userEvent, waitFor, within } from "storybook/test";

import preview from "../../.storybook/preview";
import { GroupedScoreBadges } from "./grouped-score-badge";

const meta = preview.meta({
  component: GroupedScoreBadges,
  args: {
    scores: [],
  },
});

const scores = [
  {
    id: "quality",
    name: "quality",
    dataType: "NUMERIC",
    source: "API",
    value: 0.92,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    traceId: "trace-id",
    observationId: "observation-id",
    userId: "user-id",
  },
  {
    id: "helpfulness",
    name: "helpfulness",
    dataType: "NUMERIC",
    source: "API",
    value: 0.81,
    comment: "Clear and useful response",
    metadata: { evaluator: "human" },
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    traceId: "trace-id",
    observationId: null,
    userId: "user-id",
  },
] satisfies LastUserScore[];

export const Default = meta.story({
  args: { scores },
});

export const Compact = meta.story({
  args: { scores, compact: true },
});

export const WithOverflow = meta.story({
  name: "(Test) With Overflow",
  args: {
    scores: [
      ...scores,
      {
        ...scores[0],
        id: "accuracy",
        name: "accuracy",
        value: 0.95,
      },
    ],
    maxVisible: 2,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      body.getByRole("button", { name: "Show all 3 scores" }),
    );

    await waitFor(async () => {
      await expect(
        canvasElement.ownerDocument.body.querySelectorAll(
          '[role="dialog"][data-state="open"] li',
        ),
      ).toHaveLength(3);
    });
  },
});

export const DetailsInsideBadge = meta.story({
  name: "(Test) Details Inside Badge",
  args: {
    scores: [
      scores[0],
      {
        ...scores[1],
        id: "quality-with-details",
        name: "quality",
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const value = canvasElement.querySelector('[title="0.81"]');

    await expect(value).not.toBeNull();
    await expect(value?.parentElement?.querySelectorAll("svg")).toHaveLength(2);
    await expect(
      value?.parentElement?.querySelector(
        '[aria-label="View comment for quality: 0.81"]',
      ),
    ).not.toBeNull();
    await expect(
      value?.parentElement?.querySelector(
        '[aria-label="View metadata for quality: 0.81"]',
      ),
    ).not.toBeNull();
  },
});

// Several metrics under a shared `Group.metric`
// name: the chips show it as ONE chip (prefix plus metric count), and that
// chip counts once toward `maxVisible`.
const groupScores = ["toxicity", "pii", "hate", "violence"].map(
  (metric, index) => ({
    ...scores[0],
    id: `moderation-${metric}`,
    name: `OutputModerationPrecision.${metric}`,
    value: 0.2 * (index + 1),
  }),
) satisfies LastUserScore[];

export const ScoreGroup = meta.story({
  name: "(Test) Score Group",
  args: {
    scores: [...groupScores, ...scores],
    maxVisible: 2,
  },
  play: async ({ canvasElement }) => {
    // The four metrics are one chip: prefix, count, mean of the numeric values
    // (0.2, 0.4, 0.6, 0.8)...
    const group = canvasElement.querySelector(
      '[title="OutputModerationPrecision"]',
    );
    await expect(group).not.toBeNull();
    await expect(group?.parentElement?.textContent).toContain(
      "OutputModerationPrecision(4):",
    );
    await expect(group?.parentElement?.textContent).toContain("Avg 0.50");
    await expect(
      canvasElement.querySelector('[title="OutputModerationPrecision.pii"]'),
    ).toBeNull();
    // ...and count as one toward the cap: helpfulness shows, quality rolls
    // into "+1". The popover still lists every score by name.
    await expect(
      canvasElement.querySelector('[title="helpfulness"]'),
    ).not.toBeNull();
    const overflow = canvasElement.querySelector(
      '[aria-label="Show all 6 scores"]',
    );
    await expect(overflow).not.toBeNull();
    await expect(overflow?.textContent).toBe("+1");
  },
});

// A grouped metric keeps its comment and metadata: the group chip's card
// lists the metrics as their own chips, so both stay one hover away.
const groupScoresWithDetail = [
  ...groupScores.slice(1),
  {
    ...groupScores[0],
    comment: "Flagged a slur in turn 3",
    metadata: { judge: "claude-opus-5" },
  },
] satisfies LastUserScore[];

export const ScoreGroupCardDetails = meta.story({
  name: "(Test) Score Group Card Details",
  args: { scores: groupScoresWithDetail },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector(
      '[title="OutputModerationPrecision"]',
    );
    await expect(chip).not.toBeNull();
    await userEvent.hover(chip!);
    // The card renders in a portal, so look at the whole document. Metrics
    // are labelled by suffix — the prefix is on the chip that opened it.
    const body = within(document.body);
    const toxicity = await body.findByTitle("toxicity");
    await expect(body.getByTitle("pii")).toBeInTheDocument();
    const toxicityChip = toxicity.parentElement;
    await expect(
      toxicityChip?.querySelector(
        '[aria-label="View comment for toxicity: 0.20"]',
      ),
    ).not.toBeNull();
    await expect(
      toxicityChip?.querySelector(
        '[aria-label="View metadata for toxicity: 0.20"]',
      ),
    ).not.toBeNull();
  },
});
