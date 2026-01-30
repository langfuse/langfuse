/**
 * CommentableJsonView - Wrapper component that enables text selection for inline comments
 *
 * Wraps JSON viewer content and tracks text selection to enable inline comments.
 */

import { useRef, type ReactNode } from "react";
import { useTextSelection } from "../hooks/useTextSelection";

interface CommentableJsonViewProps {
  children: ReactNode;
  dataField?: "input" | "output" | "metadata"; // Optional - auto-detected from [data-section-key] in DOM if not provided
  enabled?: boolean;
  className?: string;
}

export function CommentableJsonView({
  children,
  dataField,
  enabled = true,
  className,
}: CommentableJsonViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useTextSelection({ containerRef, dataField, enabled });

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
