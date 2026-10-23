import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SessionReviewLeadingContext = createContext<HTMLElement | null>(null);

export function SessionReviewLeadingProvider({
  element,
  children,
}: {
  element: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <SessionReviewLeadingContext.Provider value={element}>
      {children}
    </SessionReviewLeadingContext.Provider>
  );
}

/** Renders above the session/review split when a workspace provides a slot. */
export function SessionReviewLeading({ children }: { children: ReactNode }) {
  const target = useContext(SessionReviewLeadingContext);
  if (!target) return children;
  return createPortal(children, target);
}
