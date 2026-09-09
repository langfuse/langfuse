import { MessageSquareMore } from "lucide-react";

export function CommentCountIcon({ count }: { count: number }) {
  return (
    // The count overlaps the bubble's corner by a negative margin rather than by
    // `absolute`: positioned absolutely it sat OUTSIDE this span's own box, so it
    // overlapped whatever followed in a flow layout, and a clipping ancestor —
    // the trace timeline's metric cluster — cut a two-digit count mid-glyph.
    // In flow, the overhang is part of the footprint and everything reserves it.
    <span className="mr-1 inline-flex items-start text-xs">
      <MessageSquareMore className="h-4 w-4 shrink-0" />
      <span
        data-testid="comment-count"
        className="border-muted-foreground bg-muted-foreground text-muted dark:bg-muted dark:text-muted-foreground -ml-2 flex max-h-[0.8rem] min-w-[0.8rem] shrink-0 items-center justify-center rounded-sm border px-[0.2rem] text-[8px] shadow-xs"
      >
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
