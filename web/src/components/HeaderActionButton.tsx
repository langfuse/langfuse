import * as React from "react";

import { type KeyboardKey } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { InputCommandShortcut } from "@/src/components/ui/input-command";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
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
    <Tooltip>
      <TooltipTrigger asChild onFocus={(event) => event.preventDefault()}>
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn(
            "text-foreground-secondary hover:text-foreground-secondary h-7 w-7",
            active && "bg-accent/60 ring-primary/20 ring-2",
          )}
          {...props}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>{label}</span>
        {shortcut && (
          <InputCommandShortcut className="ml-2" keys={[shortcut]} />
        )}
      </TooltipContent>
    </Tooltip>
  );
});
