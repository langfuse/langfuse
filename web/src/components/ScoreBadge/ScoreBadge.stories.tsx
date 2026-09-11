import { type LastUserScore } from "@langfuse/shared";
import { expect } from "storybook/test";

import preview from "../../../.storybook/preview";
import { ScoreBadge } from "./ScoreBadge";

const score = {
  id: "quality",
  name: "quality",
  dataType: "NUMERIC",
  source: "API",
  value: 0.92,
  timestamp: new Date("2026-01-01T00:00:00.000Z"),
  traceId: "trace-id",
  observationId: "observation-id",
  userId: "user-id",
} satisfies LastUserScore;

const meta = preview.meta({
  component: ScoreBadge,
});

/** The dot's palette slot, read off the style attribute so the assertion sees
    the `--chart-N` token rather than a resolved colour. */
const dotOf = (element: Element | null) =>
  element
    ?.querySelector('span[style*="--chart-"]')
    ?.getAttribute("style")
    ?.match(/--chart-\d/)?.[0];

export const Default = meta.story({
  args: {
    name: score.name,
    scores: [score],
  },
});

export const Compact = meta.story({
  args: {
    name: score.name,
    scores: [score],
    compact: true,
  },
});

export const Categorical = meta.story({
  args: {
    name: "answered_in_right_language",
    scores: [
      {
        ...score,
        id: "language",
        name: "answered_in_right_language",
        dataType: "CATEGORICAL",
        value: null,
        stringValue: "yes",
      },
    ],
  },
});

/**
 * Several scores under one name stay listed individually — the chip aggregates
 * nothing, so no value carries an average marker.
 */
export const RepeatedName = meta.story({
  args: {
    name: score.name,
    scores: [score, { ...score, id: "quality-2", value: 0.74 }],
  },
});

/**
 * Dots come from the eight-colour dashboard chart palette, keyed on the score
 * name — the same name is the same colour everywhere it appears.
 */
export const Palette = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap gap-1">
      {[
        "quality",
        "helpfulness",
        "groundedness",
        "toxicity",
        "hallucination",
        "relevance",
        "conciseness",
        "sentiment",
      ].map((name) => (
        <ScoreBadge key={name} name={name} scores={[{ ...score, name }]} />
      ))}
    </div>
  ),
});

export const StableDotPerName = meta.story({
  name: "(Test) Stable Dot Per Name",
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap gap-1">
      <span data-testid="first-quality">
        <ScoreBadge name="quality" scores={[score]} />
      </span>
      <span data-testid="second-quality">
        <ScoreBadge name="quality" scores={[{ ...score, value: 0.1 }]} />
      </span>
      <span data-testid="helpfulness">
        <ScoreBadge
          name="helpfulness"
          scores={[{ ...score, name: "helpfulness" }]}
        />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const first = dotOf(
      canvasElement.querySelector('[data-testid="first-quality"]'),
    );
    const second = dotOf(
      canvasElement.querySelector('[data-testid="second-quality"]'),
    );
    const other = dotOf(
      canvasElement.querySelector('[data-testid="helpfulness"]'),
    );

    await expect(first).toBeTruthy();
    await expect(second).toBe(first);
    await expect(other).not.toBe(first);
  },
});

export const Constrained = meta.story({
  name: "(Test) Constrained",
  args: {
    name: "groundedness against retrieved context",
    scores: [score],
  },
  render: (args) => (
    <div className="max-w-48">
      <ScoreBadge {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const name = canvasElement.querySelector<HTMLElement>(
      '[title="groundedness against retrieved context"]',
    );
    const value = canvasElement.querySelector<HTMLElement>('[title="0.92"]');

    await expect(name).not.toBeNull();
    await expect(value).not.toBeNull();
    await expect(name!.scrollWidth).toBeGreaterThan(name!.clientWidth);
    await expect(value!.scrollWidth).toBeLessThanOrEqual(value!.clientWidth);
  },
});
