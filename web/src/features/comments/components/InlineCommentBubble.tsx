/**
 * InlineCommentBubble - floating button shown when text is selected in JSON view
 *
 * Appears near the selection and allows user to add an inline comment.
 */

import { Button } from "@/src/components/ui/button";
import { useInlineCommentSelectionOptional } from "../contexts/InlineCommentSelectionContext";
import { MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";

interface InlineCommentBubbleProps {
  onAddComment: () => void;
}

export function InlineCommentBubble({
  onAddComment,
}: InlineCommentBubbleProps) {
  const context = useInlineCommentSelectionOptional();
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    const selection = context?.selection;
    if (!selection?.anchorRect) {
      setPosition(null);
      return;
    }

    // Use startRect if available (position of selection start), fallback to anchorRect
    const posRect = selection.startRect ?? selection.anchorRect;
    // Position just above where the selection starts
    setPosition({
      top: posRect.top - 6,
      left: posRect.left,
    });
  }, [context?.selection]);

  if (!context?.selection || !position) return null;

  const handleClick = () => {
    onAddComment();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        transform: "translateY(-100%)",
        zIndex: 50,
      }}
      className="duration-100 animate-in fade-in-0 zoom-in-95"
    >
      <Button
        size="xs"
        variant="secondary"
        onClick={handleClick}
        className="border border-border bg-background px-3 py-2.5 text-muted-foreground shadow-md hover:bg-muted hover:text-foreground"
      >
        <MessageSquarePlus className="h-3 w-3" />
        <span className="ml-1">Comment</span>
      </Button>
    </div>
  );
}
