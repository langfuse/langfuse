import { type ComponentProps } from "react";

import { type Badge } from "@/src/components/design-system/Badge/Badge";

/** Column-level badge vocabulary: callers pick a semantic, decorative or neutral variant; the column maps it to a Badge color. */
export type BadgeVariant =
  | "destructive"
  | "error"
  | "success"
  | "warning"
  | "blue"
  | "violet"
  | "teal"
  | "emerald"
  | "purple"
  | "pink"
  | "orange"
  | "amber"
  | "green"
  | "default"
  | "secondary"
  | "tertiary";

type BadgeColor = NonNullable<ComponentProps<typeof Badge>["color"]>;

const badgeVariantColors: Record<BadgeVariant, BadgeColor> = {
  destructive: "red",
  error: "red",
  success: "green",
  warning: "yellow",
  blue: "blue",
  violet: "violet",
  teal: "teal",
  emerald: "emeraldTint",
  purple: "fuchsiaTint",
  pink: "pinkTint",
  orange: "orangeTint",
  amber: "amberTint",
  green: "emeraldTint",
  default: "inverted",
  secondary: "filled",
  tertiary: "filled",
};

export function badgeVariantToColor(variant: BadgeVariant): BadgeColor {
  return badgeVariantColors[variant];
}
