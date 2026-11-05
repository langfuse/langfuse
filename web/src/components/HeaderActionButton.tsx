import * as React from "react";

import { type KeyboardKey } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { ActionButtonCountBadge } from "@/src/components/ui/ActionButtonCountBadge";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

type HeaderActionButtonProps = Omit<
  ButtonProps,
  "variant" | "size" | "className" | "children" | "title"
> & {
  label: string;
  icon: React.ReactNode;
  shortcut?: KeyboardKey;
  active?: boolean;
  /** Count shown on the button, the same badge the labelled action uses. */
  count?: number;
};

export const HeaderActionButton = React.forwardRef<
  HTMLButtonElement,
  HeaderActionButtonProps
>(function HeaderActionButton(
  { label, icon, shortcut, active = false, count, ...props },
  ref,
) {
  return (
    <Tooltip
      label={label}
      shortcut={shortcut ? { keys: [shortcut] } : undefined}
    >
      {({ getTriggerProps }) => (
        <Button
          {...getTriggerProps({ ref })}
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn(
            "text-foreground-secondary hover:text-foreground-secondary relative h-7 w-7 overflow-visible",
            active && "bg-accent/60 ring-primary/20 ring-2",
          )}
          {...props}
        >
          {icon}
          {count != null && count > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 right-0 origin-top-right scale-75"
            >
              <ActionButtonCountBadge count={count} />
            </span>
          ) : null}
        </Button>
      )}
    </Tooltip>
  );
});
