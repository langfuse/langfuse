/* eslint-disable @typescript-eslint/no-use-before-define */
import { cn } from "@/src/utils/tailwind";

const PILE_LEFT = ["left-5", "left-33.5", "left-62"] as const;

/** Decorative card with three topic piles; bars fill from the bottom. */
export function TopicPilesIllustration({
  piles,
  slips = [],
  mutedLabels = false,
}: TopicPilesIllustrationProps) {
  return (
    <div aria-hidden="true" className="relative h-62.5 w-110 shrink-0">
      <div className="bg-background absolute top-17.5 left-10 z-10 h-45 w-90 rounded-lg border shadow-md">
        {piles.map((pile, pileIndex) => (
          <div
            key={pile.name}
            className={cn(
              "absolute bottom-3.5 flex w-23 flex-col gap-1.5",
              PILE_LEFT[pileIndex],
            )}
          >
            <div className="flex flex-col-reverse gap-0.75">
              {Array.from({ length: pile.slots }, (_, index) => (
                <PileBar
                  key={index}
                  color={pile.color}
                  index={index}
                  filled={index < pile.filled}
                />
              ))}
            </div>
            <div className="flex flex-col text-xs">
              <span
                className={cn(
                  "font-bold whitespace-nowrap",
                  mutedLabels && "text-muted-foreground",
                )}
              >
                {pile.name}
              </span>
              <span className="text-muted-foreground font-mono">
                {pile.detail}
              </span>
            </div>
          </div>
        ))}
      </div>
      {slips.map((slip) => (
        <div
          key={slip.text}
          className={cn(
            "bg-background absolute z-20 flex items-center gap-1.75 rounded-lg border px-2.5 py-1.75 text-xs whitespace-nowrap shadow-md",
            slip.position,
          )}
        >
          <span
            className="size-1.75 shrink-0 rounded-full"
            style={{ backgroundColor: categoryColor(slip.color) }}
          />
          {slip.text}
        </div>
      ))}
    </div>
  );
}

function PileBar({ color, index, filled }: PileBarProps) {
  return (
    <span
      className={cn(
        "h-2.25 rounded-sm border transition-colors duration-500",
        filled ? "border-transparent" : "border-dashed",
      )}
      style={{
        backgroundColor: filled ? fadedColor(color, index) : "transparent",
      }}
    />
  );
}

function categoryColor(color: PileColor) {
  return `var(--category-${color}-highlight)`;
}

/** Bottom bar strongest; each bar above fades 8% toward the page. */
function fadedColor(color: PileColor, index: number) {
  return `color-mix(in oklch, ${categoryColor(color)} ${100 - index * 8}%, hsl(var(--background)))`;
}

type PileColor = "violet" | "blue" | "amber";

export type TopicPile = {
  name: string;
  detail: string;
  slots: number;
  filled: number;
  color: PileColor;
};

type TopicPilesIllustrationProps = {
  /** Three piles, left to right. */
  piles: readonly TopicPile[];
  slips?: readonly { text: string; color: PileColor; position: string }[];
  mutedLabels?: boolean;
};

type PileBarProps = { color: PileColor; index: number; filled: boolean };
