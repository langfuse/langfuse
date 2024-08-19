import { MessageCircleMore } from "lucide-react";

export function CommentCountIcon({ count }: { count?: number }) {
  if (!count) return null;

  return (
    <span className="relative mr-1 text-xs">
      <MessageCircleMore className="h-5 w-5 text-muted-foreground" />
      <span className="absolute -top-0.5 left-3 flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground bg-accent-light-blue text-xs">
        {count}
      </span>
    </span>
  );
}
