"use client";

import type { PropsWithChildren } from "react";

import {
  InAppAgentWindowHost,
  useInAppAgentInlinePresentation,
} from "@/src/features/in-app-agent/components/InAppAgentWindowHost";
import { cn } from "@/src/utils/tailwind";

/**
 * Lays the page content out beside the assistant. Docked, the window is a
 * sibling that takes its width from the content; full page, it replaces the
 * content, which stays mounted so the page keeps its state for the way back.
 */
export function InAppAgentDockLayout({ children }: PropsWithChildren) {
  const inlinePresentation = useInAppAgentInlinePresentation();

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          inlinePresentation === "full" && "hidden",
        )}
      >
        {children}
      </div>
      <InAppAgentWindowHost />
    </div>
  );
}
