// LFE-7628: general comment counts use the square speech bubble, matching the
// CommentDrawerButton, to stay distinct from per-score comment indicators.
import { MessageSquareMore } from "lucide-react";

export function CommentCountIcon({ count }: { count?: number }) {
  if (!count) return null;

  return (
    <span className="relative mr-1 text-xs">
      <MessageSquareMore className="h-4 w-4" />
      <span className="border-muted-foreground bg-muted-foreground text-muted dark:bg-muted dark:text-muted-foreground absolute -top-0.5 left-2.5 flex max-h-[0.8rem] min-w-[0.8rem] items-center justify-center rounded-sm border px-[0.2rem] text-[8px] shadow-xs">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
