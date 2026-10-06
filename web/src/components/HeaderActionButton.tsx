import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { type KeyboardKey } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { InputCommandShortcut } from "@/src/components/ui/input-command";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { cn } from "@/src/utils/tailwind";

type HeaderActionButtonProps = Omit<
  ButtonProps,
  "variant" | "size" | "className" | "children" | "title"
> & {
  label: string;
  icon: React.ReactNode;
  shortcut?: KeyboardKey;
  active?: boolean;
};

export const HeaderActionButton = React.forwardRef<
  HTMLButtonElement,
  HeaderActionButtonProps
>(function HeaderActionButton(
  { label, icon, shortcut, active = false, ...props },
  ref,
) {
  return (
    <CustomTooltip
      content={
        <>
          <span>{label}</span>
          {shortcut && (
            <InputCommandShortcut className="ml-2" keys={[shortcut]} />
          )}
        </>
      }
    >
      {({ getTriggerProps }) => (
        <Slot ref={ref}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            className={cn(
              "text-foreground-secondary hover:text-foreground-secondary h-7 w-7",
              active && "bg-accent/60 ring-primary/20 ring-2",
            )}
            {...getTriggerProps({
              ...props,
              onFocus: (event) => {
                event.preventDefault();
                props.onFocus?.(event as React.FocusEvent<HTMLButtonElement>);
              },
            })}
          >
            {icon}
          </Button>
        </Slot>
      )}
    </CustomTooltip>
  );
});
