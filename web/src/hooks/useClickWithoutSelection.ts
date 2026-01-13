import { useRef, useCallback, type MouseEvent } from "react";

interface UseClickWithoutSelectionOptions {
  /**
   * Callback to execute when a click is detected (not a text selection drag)
   */
  onClick: (event: MouseEvent) => void;

  /**
   * Distance threshold in pixels to distinguish click from drag
   * @default 5
   */
  dragThreshold?: number;

  /**
   * Whether the hook is enabled
   * @default true
   */
  enabled?: boolean;
}

interface UseClickWithoutSelectionReturn {
  /**
   * Props to spread onto the element
   */
  props: {
    onMouseDown: (e: MouseEvent) => void;
    onClick: (e: MouseEvent) => void;
  };
}

/**
 * Hook to distinguish between clicks and text selection drags.
 * Returns props to spread onto an element that should be clickable
 * but also allow text selection within it.
 *
 * Uses two detection mechanisms:
 * 1. Position-based: Tracks mouse movement between mousedown and click
 * 2. Selection API: Checks if text was selected within the element
 *
 * @example
 * ```tsx
 * const { props } = useClickWithoutSelection({
 *   onClick: () => handleExpand(),
 * });
 *
 * return <div {...props}>Clickable content with selectable text</div>
 * ```
 */
export function useClickWithoutSelection({
  onClick,
  dragThreshold = 5,
  enabled = true,
}: UseClickWithoutSelectionOptions): UseClickWithoutSelectionReturn {
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!enabled) return;

      // Only track left mouse button
      if (e.button === 0) {
        mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [enabled],
  );

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!enabled) {
        onClick(e);
        return;
      }

      // Check 1: Position-based drag detection
      let wasDrag = false;
      if (mouseDownPosRef.current) {
        const dx = e.clientX - mouseDownPosRef.current.x;
        const dy = e.clientY - mouseDownPosRef.current.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        wasDrag = distance > dragThreshold;
        mouseDownPosRef.current = null;
      }

      if (wasDrag) {
        return; // Mouse moved significantly - was a selection drag
      }

      // Check 2: Selection API detection
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        try {
          const range = selection.getRangeAt(0);
          const targetElement = e.currentTarget as HTMLElement;

          // Only ignore click if selection is within this element
          if (targetElement.contains(range.commonAncestorContainer)) {
            return; // User just selected text in this element
          }
        } catch {
          // getRangeAt can throw if no range exists
          // Fall through to onClick
        }
      }

      // Passed all checks - this was a genuine click
      onClick(e);
    },
    [enabled, onClick, dragThreshold],
  );

  return {
    props: {
      onMouseDown: handleMouseDown,
      onClick: handleClick,
    },
  };
}
