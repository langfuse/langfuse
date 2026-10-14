import { MessageSquareMore } from "lucide-react";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

export function CommentCountIcon({
  count,
  color = "filled",
}: {
  count: number;
  /** `filledOnMuted` on a muted or accent surface such as a selected row. */
  color?: "filled" | "filledOnMuted";
}) {
  return (
    <BadgeShell color={color} font="mono" size="md">
      <MessageSquareMore aria-hidden className="icon-sm shrink-0" />
      <span data-testid="comment-count">{count > 99 ? "99+" : count}</span>
    </BadgeShell>
  );
}
