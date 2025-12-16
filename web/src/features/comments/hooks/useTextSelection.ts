import { useEffect, useCallback, useRef } from "react";
import { useInlineCommentSelectionOptional } from "../contexts/InlineCommentSelectionContext";
import { selectionToPath } from "../lib/selectionToPath";

interface UseTextSelectionOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  dataField: "input" | "output" | "metadata";
  enabled?: boolean;
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

      const result = selectionToPath(
        selection,
        containerRef.current,
        dataField,
      );
      if (result) {
        context.setSelection({
          ...result,
          anchorRect: range.getBoundingClientRect(),
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
