import { expect } from "storybook/test";
import preview from "../../.storybook/preview";
import { ItemBadge, type LangfuseItemType } from "./ItemBadge";

const meta = preview.meta({
  component: ItemBadge,
});

const TYPES: LangfuseItemType[] = [
  "TRACE",
  "SPAN",
  "GENERATION",
  "AGENT",
  "TOOL",
  "CHAIN",
  "RETRIEVER",
  "EMBEDDING",
  "EVENT",
  "GUARDRAIL",
];

export const Default = meta.story({
  args: { type: "GENERATION" },
});

export const WithLabel = meta.story({
  args: { type: "GENERATION", showLabel: true },
});

export const Small = meta.story({
  args: { type: "GENERATION", isSmall: true },
});

/** Every type at both sizes, icon-only and labelled. */
export const VariantMatrix = meta.story({
  args: { type: "GENERATION" },
  render: () => (
    <div className="flex w-fit flex-col gap-3 text-sm">
      {(
        [
          ["icon only", false],
          ["with label", true],
        ] as const
      ).map(([caption, showLabel]) => (
        <div key={caption} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{caption}</span>
          <div className="flex flex-wrap items-center gap-2">
            {TYPES.map((type) => (
              <ItemBadge key={type} type={type} showLabel={showLabel} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TYPES.map((type) => (
              <ItemBadge key={type} type={type} showLabel={showLabel} isSmall />
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
});

export const IconOnlyIsSquare = meta.story({
  name: "(Test) Icon Only Is Square",
  args: { type: "GENERATION" },
  render: () => (
    <div className="flex items-center gap-2">
      {TYPES.map((type) => (
        <span key={type} data-testid="icon-only">
          <ItemBadge type={type} />
        </span>
      ))}
      {TYPES.map((type) => (
        <span key={`${type}-small`} data-testid="icon-only-small">
          <ItemBadge type={type} isSmall />
        </span>
      ))}
      <span data-testid="labelled">
        <ItemBadge type="GENERATION" showLabel />
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // The icon is square, so its box is too — a rectangle around it was just
    // horizontal padding with nothing to pad.
    for (const testId of ["icon-only", "icon-only-small"]) {
      const badges = canvasElement.querySelectorAll<HTMLElement>(
        `[data-testid="${testId}"] > *`,
      );
      await expect(badges.length).toBe(TYPES.length);
      for (const badge of badges) {
        const box = badge.getBoundingClientRect();
        await expect(box.width).toBeCloseTo(box.height, 0);
        await expect(box.width).toBeGreaterThan(0);
      }
    }

    // A labelled badge keeps its pill: there the padding separates icon from text.
    const labelled = canvasElement
      .querySelector<HTMLElement>('[data-testid="labelled"] > *')
      ?.getBoundingClientRect();
    if (!labelled) throw new Error("no labelled badge");
    await expect(labelled.width).toBeGreaterThan(labelled.height);
  },
});
