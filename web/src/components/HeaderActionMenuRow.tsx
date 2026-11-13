import * as React from "react";

import { Button, type ButtonProps } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

type HeaderActionMenuRowProps = Omit<
  ButtonProps,
  "variant" | "size" | "className" | "children" | "title"
> & {
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: "default" | "destructive";
  disabledReason?: string;
};

/** Full-width labeled row for the mobile header overflow menu. */
export const HeaderActionMenuRow = React.forwardRef<
  HTMLButtonElement,
  HeaderActionMenuRowProps
>(function HeaderActionMenuRow(
  { label, icon, badge, variant = "default", disabledReason, ...props },
  ref,
) {
  // Touch screens never show the title tooltip, so a disabled row spells out why.
  const visibleReason = props.disabled ? disabledReason : undefined;
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-2 font-normal",
        variant === "destructive" && "text-destructive hover:text-destructive",
        visibleReason &&
          "h-auto items-start py-1 text-left whitespace-normal [&>svg]:mt-0.5",
      )}
      title={disabledReason}
      {...props}
    >
      {icon}
      {visibleReason ? (
        <span className="flex min-w-0 flex-col">
          {label}
          <span className="text-muted-foreground text-xs">{visibleReason}</span>
        </span>
      ) : (
        label
      )}
      {badge}
    </Button>
  );
});
