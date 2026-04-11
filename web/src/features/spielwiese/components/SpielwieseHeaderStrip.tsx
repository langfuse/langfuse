"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";

export const spielwieseInlineInputClassName =
  "h-auto rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:border-transparent focus-visible:ring-0";
export const spielwieseStripItemClassName =
  "border-[rgba(0,0,0,0.08)] bg-background flex h-7 shrink-0 items-center overflow-hidden rounded-[8px] border";
export const spielwieseStripItemFieldClassName = "min-w-0 px-2";

const stripTagClassName =
  "group/setting-tag border-r border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.02)] text-foreground/58 flex h-full w-6 shrink-0 overflow-hidden whitespace-nowrap transition-[width] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";
const stripTagContentClassName = "flex h-full items-center gap-1 px-1.5";
const stripTagLabelClassName =
  "max-w-0 -translate-x-1 overflow-hidden opacity-0 text-[0.6875rem] font-medium transition-[max-width,opacity,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover/setting-tag:translate-x-0 group-hover/setting-tag:opacity-100";

export function SpielwieseHeaderStripTag({
  children,
  className,
  label,
  revealLabelWidthClassName = "group-hover/setting-tag:max-w-[4.25rem]",
  revealWidthClassName = "hover:w-[6.5rem]",
}: {
  children: ReactNode;
  className?: string;
  label: string;
  revealLabelWidthClassName?: string;
  revealWidthClassName?: string;
}) {
  return (
    <div className={cn(stripTagClassName, revealWidthClassName, className)}>
      <div className={stripTagContentClassName}>
        {children}
        <div
          aria-hidden="true"
          className={cn(stripTagLabelClassName, revealLabelWidthClassName)}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
