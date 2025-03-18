import { cn } from "@/src/utils/tailwind";
import { MessageCircleMore } from "lucide-react";

export function CommentCountIcon({ count }: { count?: number }) {
  if (!count) return null;

  return (
    <span className="relative mr-1 text-xs">
      <MessageCircleMore className="h-4 w-4" />
      <span
        className={cn(
          "absolute -top-0.5 left-2.5 flex max-h-[0.8rem] min-w-[0.8rem] items-center justify-center rounded-sm border border-muted-foreground bg-muted-foreground px-[0.2rem] text-[8px] text-muted shadow-sm dark:bg-muted dark:text-muted-foreground",
        )}
      >
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
