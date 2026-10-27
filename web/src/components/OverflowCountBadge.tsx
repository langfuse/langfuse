import { type ComponentPropsWithoutRef, type Ref } from "react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

type OverflowCountBadgeProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "type"
> & {
  count: number;
  /** `filledOnMuted` on a muted or accent surface such as a selected row. */
  color?: "filled" | "filledOnMuted";
  ref?: Ref<HTMLButtonElement>;
};

/** The "+N" control after a row of chips; works as a popover trigger via asChild. */
export function OverflowCountBadge({
  count,
  color = "filled",
  ref,
  ...props
}: OverflowCountBadgeProps) {
  return (
    <BadgeShell asChild color={color} font="mono" size="md">
      <button
        ref={ref}
        type="button"
        className="text-muted-foreground cursor-pointer self-center"
        {...props}
      >
        +{count}
      </button>
    </BadgeShell>
  );
}
