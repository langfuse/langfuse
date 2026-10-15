import preview from "../../../../.storybook/preview";
import { expect } from "storybook/test";
import { ComposerTokens, WORD_JOINER } from "./ComposerTokens";
import { EVENTS_FIELD_REGISTRY } from "../lib/fields";

const meta = preview.meta({
  component: ComposerTokens,
  args: { showDiagnostics: false },
  // ComposerTokens returns inline content; host it in a bar-like box so the
  // tokens render in a representative context.
  decorators: [
    (Story) => (
      <div className="border-input bg-background max-w-2xl rounded-md border px-3 py-2 font-mono text-xs leading-6">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({
  args: { draft: "level:ERROR -environment:dev latency:>2" },
});

export const Empty = meta.story({
  args: { draft: "" },
});

export const AnyOfGroup = meta.story({
  args: { draft: "level:(ERROR OR WARNING) type:GENERATION" },
});

export const FreeTextAndScopes = meta.story({
  args: { draft: "timeout input:refund scores.accuracy:>0.8" },
});

export const InvalidRevealed = meta.story({
  args: { draft: "level:ERROR nope:1", showDiagnostics: true },
});

export const ExperimentTargetSuffix = meta.story({
  name: "(Test) Experiment target preserves source whitespace",
  args: {
    draft: '-scores.quality:>0.8   @"Claude Sonnet"',
    showDiagnostics: true,
    registry: {
      ...EVENTS_FIELD_REGISTRY,
      targeting: {
        defaultTarget: "baseline",
        supports: (field) => field.type === "scores",
        targets: [
          {
            id: "run-b",
            label: "Claude Sonnet",
            textClassName: "text-pink-500",
          },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    await expect(
      canvasElement
        .querySelector('[data-kind="filter"]')
        ?.textContent?.split(WORD_JOINER)
        .join(""),
    ).toBe(args.draft);
    await expect(
      canvasElement.querySelectorAll('[data-kind="filter"]'),
    ).toHaveLength(1);
  },
});

export const ExperimentTargetPrefix = meta.story({
  name: "(Test) Experiment prefix keeps quoted field and value intact",
  args: {
    draft: '-"Run: A".scores."Rouge Score":>0.8',
    showDiagnostics: true,
    registry: {
      ...EVENTS_FIELD_REGISTRY,
      targeting: {
        defaultTarget: "all",
        supports: () => true,
        targets: [
          { id: "run-a", label: "Run: A", textClassName: "text-pink-500" },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    await expect(
      canvasElement
        .querySelector('[data-kind="filter"]')
        ?.textContent?.split(WORD_JOINER)
        .join(""),
    ).toBe(args.draft);
    await expect(
      canvasElement.querySelector('[data-part="target"]')?.textContent,
    ).toBe('"Run: A".');
    await expect(
      canvasElement.querySelector('[data-part="field"]')?.textContent,
    ).toBe('scores."Rouge Score"');
    await expect(
      canvasElement.querySelector('[data-part="value"]')?.textContent,
    ).toBe(">0.8");
  },
});
