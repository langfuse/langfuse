/**
 * InlineCommentBubble - floating button shown when text is selected in JSON view
 *
 * Appears near the selection and allows user to add an inline comment.
 */

import { Button } from "@/src/components/ui/button";
import { MessageSquarePlus } from "lucide-react";

interface InlineCommentBubbleProps {
  onAddComment: () => void;
  positionRect: DOMRect;
}

export function InlineCommentBubble({
  onAddComment,
  positionRect,
}: InlineCommentBubbleProps) {
  const handleClick = () => {
    onAddComment();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: positionRect.top - 6,
        left: positionRect.left,
        transform: "translateY(-100%)",
        zIndex: 50,
      }}
      className="animate-in fade-in-0 zoom-in-95 duration-100"
    >
      <Button
        size="xs"
        variant="secondary"
        onClick={handleClick}
        className="border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground border px-3 py-2.5 shadow-md"
      >
        <MessageSquarePlus className="h-3 w-3" />
        <span className="ml-1">Comment</span>
      </Button>
    </div>
  );
}
