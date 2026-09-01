"use client";

import { createContext, use, type ReactNode } from "react";
import { createPortal } from "react-dom";

const InAppAgentHeaderSlotContext = createContext<HTMLElement | null>(null);

export function InAppAgentHeaderSlotProvider({
  children,
  slot,
}: {
  children: ReactNode;
  slot: HTMLElement | null;
}) {
  return (
    <InAppAgentHeaderSlotContext value={slot}>
      {children}
    </InAppAgentHeaderSlotContext>
  );
}

/**
 * Lifts the page header above the docked-assistant split so the top bar stays
 * full width and only the page body is compressed.
 */
export function InAppAgentHeaderPortal({ children }: { children: ReactNode }) {
  const slot = use(InAppAgentHeaderSlotContext);

  if (!slot) {
    return children;
  }

  return createPortal(children, slot);
}
