"use client";

import { cn } from "@/src/utils/tailwind";
import type { Ref } from "react";

export function FinderShortcut({
  className,
  label,
  shortcutRef,
}: {
  className?: string;
  label: string;
  shortcutRef?: Ref<HTMLElement>;
}) {
  return (
    <kbd
      className={cn(
        "border-border/70 bg-background text-muted-foreground pointer-events-none inline-flex h-5 items-center rounded-[0.45rem] border px-1.5 font-mono text-[10px] font-medium shadow-xs select-none",
        className,
      )}
      ref={shortcutRef}
    >
      <span>{label}</span>
    </kbd>
  );
}
