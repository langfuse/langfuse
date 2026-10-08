import { MessageSquareMore } from "lucide-react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

export function CommentCountIcon({ count }: { count: number }) {
  return (
    <BadgeShell color="filled" font="mono" size="md">
      <MessageSquareMore aria-hidden className="icon-sm shrink-0" />
      <span data-testid="comment-count">{count > 99 ? "99+" : count}</span>
    </BadgeShell>
  );
}
