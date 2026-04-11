"use client";

import type { Ref } from "react";

export function FinderShortcut({
  label,
  shortcutRef,
}: {
  label: string;
  shortcutRef?: Ref<HTMLElement>;
}) {
  return (
    <kbd
      className="border-border/70 bg-background text-muted-foreground pointer-events-none inline-flex h-5 items-center rounded-[0.45rem] border px-1.5 font-mono text-[10px] font-medium shadow-xs select-none"
      ref={shortcutRef}
    >
      <span>{label}</span>
    </kbd>
  );
}
