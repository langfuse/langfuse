import { type ComponentPropsWithoutRef, type Ref } from "react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

type OverflowCountBadgeProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "children" | "className" | "type"
> & {
  count: number;
  ref?: Ref<HTMLButtonElement>;
};

/** The "+N" control after a row of chips; works as a popover trigger via asChild. */
export function OverflowCountBadge({
  count,
  ref,
  ...props
}: OverflowCountBadgeProps) {
  return (
    <BadgeShell asChild color="filled" font="mono" size="md">
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
