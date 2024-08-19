import { MessageCircleMore } from "lucide-react";

export function CommentCountIcon({ count }: { count?: number }) {
  if (!count) return null;

  return (
    <span className="relative mr-1 text-xs text-muted-foreground">
      <MessageCircleMore className="h-5 w-5" />
      <span className="absolute -right-2 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted-orange text-xs">
        {count}
      </span>
    </span>
  );
}
