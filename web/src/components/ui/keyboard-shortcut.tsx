import * as React from "react";

import { cn } from "@/src/utils/tailwind";

export type KeyboardShortcutProps = Omit<
  React.ComponentPropsWithoutRef<"kbd">,
  "children"
> & {
  children?: React.ReactNode;
  keys?: React.ReactNode[];
};

const KeyboardShortcut = React.forwardRef<HTMLElement, KeyboardShortcutProps>(
  ({ className, children, keys, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "bg-muted text-muted-foreground pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-md border px-1.5 font-mono text-[10px] leading-none font-medium shadow-xs select-none",
        className,
      )}
      {...props}
    >
      {keys
        ? keys.map((key, index) => <span key={index}>{key}</span>)
        : children}
    </kbd>
  ),
);
KeyboardShortcut.displayName = "KeyboardShortcut";

export { KeyboardShortcut };
