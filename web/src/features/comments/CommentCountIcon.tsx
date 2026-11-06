import { MessageSquareMore } from "@langfuse/icons";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

export function CommentCountIcon({ count }: { count: number }) {
  return (
    <BadgeShell color="filled" size="md">
      <MessageSquareMore aria-hidden size="sm" />
      <span data-testid="comment-count">{count > 99 ? "99+" : count}</span>
    </BadgeShell>
  );
}
