"use client";

import { cva } from "class-variance-authority";
import { ChevronDown } from "@langfuse/icons";
import {
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type RefObject,
} from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";

const peekVariants = cva("", {
  variants: {
    collapsedHeight: {
      sm: "max-h-32",
      md: "max-h-48",
      lg: "max-h-64",
    },
  },
});

type ExpandableContentPeekProps = PropsWithChildren<{
  /** Label of the button that reveals the rest, e.g. "Show all steps". */
  expandLabel: string;
  collapsedHeight?: "sm" | "md" | "lg";
  /** Called once when the clamped content is revealed. */
  onAfterExpand?: () => void;
}>;

function useIsOverflowing(
  containerRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  isEnabled: boolean,
) {
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Measured before paint so clamped content never flashes without its fade.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!isEnabled || !container || !content) return;

    const measure = () =>
      setIsOverflowing(content.offsetHeight > container.clientHeight);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, [containerRef, contentRef, isEnabled]);

  return isOverflowing;
}

/**
 * Shows the top of its content and fades the rest out behind an expand button.
 * Expanding is one-way; remount (e.g. with a `key`) to collapse again. Content
 * that already fits renders without fade or button.
 */
export function ExpandableContentPeek({
  children,
  expandLabel,
  collapsedHeight = "md",
  onAfterExpand,
}: ExpandableContentPeekProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isOverflowing = useIsOverflowing(containerRef, contentRef, !isExpanded);
  const isClamped = !isExpanded && isOverflowing;

  const expand = () => {
    setIsExpanded(true);
    onAfterExpand?.();
  };

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn(
          !isExpanded && ["overflow-hidden", peekVariants({ collapsedHeight })],
          isClamped &&
            "[mask-image:linear-gradient(to_bottom,black_40%,transparent)]",
        )}
        // Keyboard users tabbing into the hidden part get the full content.
        onFocus={isClamped ? expand : undefined}
      >
        <div ref={contentRef}>{children}</div>
      </div>
      {isClamped ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronDown}
            text={expandLabel}
            aria-expanded={false}
            onClick={expand}
          />
        </div>
      ) : null}
    </div>
  );
}
