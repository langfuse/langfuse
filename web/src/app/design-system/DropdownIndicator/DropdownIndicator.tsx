import { cva } from "class-variance-authority";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
} from "lucide-react";
import { type Ref } from "react";

const icons = {
  down: ChevronDown,
  up: ChevronUp,
  right: ChevronRight,
  left: ChevronLeft,
  "up-down": ChevronsUpDown,
};

const indicatorVariants = cva(
  "text-foreground-tertiary shrink-0 transition-transform",
  {
    variants: {
      size: {
        base: "icon-base",
        sm: "icon-sm",
      },
      nudge: {
        true: "translate-y-px",
      },
    },
    defaultVariants: { size: "base" },
  },
);

type DropdownIndicatorProps = {
  direction?: keyof typeof icons;
  size?: "base" | "sm";
  // Optical nudge for icons sitting next to text in an items-center row.
  nudge?: boolean;
  ref?: Ref<SVGSVGElement>;
};

export function DropdownIndicator({
  direction = "down",
  size,
  nudge,
  ref,
}: DropdownIndicatorProps) {
  const Icon = icons[direction];
  return (
    <Icon
      aria-hidden
      className={indicatorVariants({ size, nudge })}
      ref={ref}
    />
  );
}
