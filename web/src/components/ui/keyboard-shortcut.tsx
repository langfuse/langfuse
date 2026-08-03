import * as React from "react";

import { cn } from "@/src/utils/tailwind";

type KeyboardShortcutContent =
  | { children: React.ReactNode; keys?: never }
  | { children?: never; keys: React.ReactNode[] };

export type KeyboardShortcutProps = Omit<
  React.ComponentPropsWithoutRef<"kbd">,
  "children"
> &
  KeyboardShortcutContent;

const KeyboardShortcut = React.forwardRef<HTMLElement, KeyboardShortcutProps>(
  ({ className, children, keys, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        // Hidden below `md` (768px, matches useIsMobile) by default: a
        // keyboard-shortcut hint is noise on a touch device with no physical
        // keyboard. This only hides the visual chip — the shortcut's own
        // keydown handler is untouched, so a Bluetooth keyboard still works.
        // CSS-only (no useIsMobile()) so SSR'd hints don't hydration-mismatch
        // or flash on first paint (LFE-11067).
        "bg-muted text-muted-foreground pointer-events-none hidden h-5 min-w-5 items-center justify-center gap-1 rounded-md border px-1.5 font-mono text-[10px] leading-none font-bold shadow-xs select-none md:inline-flex",
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
