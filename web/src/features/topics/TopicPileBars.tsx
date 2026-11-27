import { cn } from "@/src/utils/tailwind";

/** Decorative: three piles of bars that fill from the bottom. */
export function TopicPileBars({ piles }: TopicPileBarsProps) {
  return (
    <div aria-hidden="true" className="flex items-end gap-4">
      {piles.map((pile) => (
        <div key={pile.name} className="flex w-9 flex-col-reverse gap-0.75">
          {Array.from({ length: pile.slots }, (_, index) => (
            <PileBar
              key={index}
              color={pile.color}
              index={index}
              filled={index < pile.filled}
            />
          ))}
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

/** Bottom bar strongest; each bar above fades 8% toward the page. */
function fadedColor(color: PileColor, index: number) {
  return `color-mix(in oklch, var(--category-${color}-highlight) ${100 - index * 8}%, hsl(var(--background)))`;
}

type PileColor = "violet" | "blue" | "amber";

export type TopicPileBar = {
  name: string;
  slots: number;
  filled: number;
  color: PileColor;
};

type TopicPileBarsProps = {
  /** Three piles, left to right. */
  piles: readonly TopicPileBar[];
};

type PileBarProps = { color: PileColor; index: number; filled: boolean };
