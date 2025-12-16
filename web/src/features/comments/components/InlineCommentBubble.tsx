/**
 * InlineCommentBubble - floating button shown when text is selected in JSON view
 *
 * Appears near the selection and allows user to add an inline comment.
 */

import { Button } from "@/src/components/ui/button";
import { useInlineCommentSelectionOptional } from "../contexts/InlineCommentSelectionContext";
import { MessageCirclePlus } from "lucide-react";
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
    if (!context?.selection?.anchorRect) {
      setPosition(null);
      return;
    }

    const rect = context.selection.anchorRect;
    // TODO: make position closer to selection
    // Position above the selection, centered
    setPosition({
      top: rect.top - 40,
      left: rect.left + rect.width / 2,
    });
  }, [context?.selection?.anchorRect]);

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
        transform: "translateX(-50%)",
        zIndex: 50,
      }}
      className="animate-in fade-in-0 zoom-in-95"
    >
      <Button
        size="sm"
        variant="default"
        onClick={handleClick}
        className="shadow-lg"
      >
        <MessageCirclePlus className="mr-1 h-4 w-4" />
        Comment
      </Button>
    </div>
  );
}
