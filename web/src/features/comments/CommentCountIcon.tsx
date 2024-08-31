import { MessageCircleMore } from "lucide-react";

export function CommentCountIcon({ count }: { count?: number }) {
  if (!count) return null;

  return (
    <span className="relative mr-1 text-xs">
      <MessageCircleMore className="h-4 w-4" />
      <span className="absolute -top-0.5 left-2.5 flex max-h-[0.8rem] min-w-[0.8rem] items-center justify-center rounded-full border border-muted-foreground bg-accent-light-blue px-[0.2rem] text-[8px]">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
