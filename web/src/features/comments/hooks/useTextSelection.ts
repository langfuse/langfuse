import { useEffect, useCallback, useRef } from "react";
import { useInlineCommentSelectionOptional } from "../contexts/InlineCommentSelectionContext";
import { selectionToPath } from "../lib/selectionToPath";

interface UseTextSelectionOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  dataField?: "input" | "output" | "metadata"; // Optional - auto-detected from [data-section-key] if not provided
  enabled?: boolean;
}

/**
 * Finds the section key (input/output/metadata) from the DOM by looking for
 * the closest ancestor with [data-section-key] attribute.
 */
function detectSectionFromDOM(
  node: Node,
): "input" | "output" | "metadata" | null {
  let current: Node | null = node;
  while (current && current !== document.body) {
    if (current instanceof HTMLElement && current.dataset.sectionKey) {
      const key = current.dataset.sectionKey;
      if (key === "input" || key === "output" || key === "metadata") {
        return key;
      }
    }
    current = current.parentNode;
  }
  return null;
}

export function useTextSelection({
  containerRef,
  dataField,
  enabled = true,
}: UseTextSelectionOptions) {
  const context = useInlineCommentSelectionOptional();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectionChange = useCallback(() => {
    if (!enabled || !containerRef.current || !context) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        // Only clear if the interaction was INSIDE our container
        // If user clicked elsewhere (like comment textarea), keep the pending selection
        const focusNode = selection?.focusNode;
        if (focusNode && containerRef.current?.contains(focusNode)) {
          context.clearSelection();
        }
        // Otherwise, don't clear - user might be interacting with comment UI
        return;
      }

      const range = selection.getRangeAt(0);
      if (!containerRef.current?.contains(range.commonAncestorContainer)) {
        return; // Selection outside our container
      }

      // Determine dataField - use prop if provided, otherwise detect from DOM
      const effectiveDataField =
        dataField ?? detectSectionFromDOM(range.startContainer);
      if (!effectiveDataField) {
        return;
      }

      const result = selectionToPath(
        selection,
        containerRef.current,
        effectiveDataField,
      );
      if (result) {
        // Get the position of the selection START (not the full bounding box)
        // This gives us where to position the comment bubble
        const startRange = range.cloneRange();
        startRange.collapse(true); // Collapse to start
        const startRect = startRange.getBoundingClientRect();

        context.setSelection({
          ...result,
          anchorRect: range.getBoundingClientRect(),
          startRect,
        });
      }
    }, 150);
  }, [enabled, containerRef, dataField, context]);

  useEffect(() => {
    if (!enabled || !context) return;
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, handleSelectionChange, context]);

  return { clearSelection: context?.clearSelection };
}
