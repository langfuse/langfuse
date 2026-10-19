import { cva } from "class-variance-authority";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
} from "@langfuse/icons";
import { type Ref } from "react";

const icons = {
  down: ChevronDown,
  up: ChevronUp,
  right: ChevronRight,
  left: ChevronLeft,
  "up-down": ChevronsUpDown,
};

const indicatorVariants = cva("transition-transform", {
  variants: {
    nudge: {
      true: "translate-y-px",
    },
  },
});

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
      size={size}
      color="tertiary"
      __rawClassName={indicatorVariants({ nudge })}
      ref={ref}
    />
  );
}
