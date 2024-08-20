import { MessageCircleMore } from "lucide-react";

export function CommentCountIcon({ count }: { count?: number }) {
  if (!count) return null;

  return (
    <span className="relative mr-1 text-xs">
      <MessageCircleMore className="h-5 w-5" />
      <span
        className="absolute -top-0.5 left-3 flex max-h-[1rem] min-w-[1rem] items-center justify-center rounded-full border border-muted-foreground bg-accent-light-blue px-0.5"
        style={{ fontSize: "0.6rem" }}
      >
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
