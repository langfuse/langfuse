/* eslint-disable @repo/no-null-render */
/**
 * Trace-level reference links for the trace summary strip and detail
 * headers. Styled like the quiet metric text (muted mono, no border/box) and
 * distinguished only by link affordance — hover color, underline, and the
 * trailing arrow icon. Pills are reserved for tags. Each element handles its
 * own null check and returns null when the underlying value is unavailable.
 */

import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

// Same scale as the metrics tier; link affordance (hover color + underline)
// is the only thing that sets a reference apart from a plain metric.
const REFERENCE_LINK_CLASS =
  "text-muted-foreground hover:text-link inline-flex min-w-0 max-w-[280px] shrink-0 items-center gap-1 text-[11px] whitespace-nowrap hover:underline";

type ReferenceLinkProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  "href" | "children" | "className"
>;

/** Extra props and the ref go to the anchor so a Radix `asChild` trigger
 * (the session / user hover cards) can attach to the link itself. */
export const SessionBadge = forwardRef<
  HTMLAnchorElement,
  { sessionId: string | null; projectId: string } & ReferenceLinkProps
>(function SessionBadge({ sessionId, projectId, ...props }, ref) {
  if (!sessionId) return null;

  return (
    <Link
      ref={ref}
      href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
      // Underlined at rest: it owns a hover card, like the token count.
      className={`ph-no-capture ${REFERENCE_LINK_CLASS} decoration-muted-foreground/50 underline underline-offset-4`}
      title={`Session ${sessionId}`}
      {...props}
    >
      Session
      <ArrowUpRight className="h-3 w-3 shrink-0" />
    </Link>
  );
});

export const UserIdBadge = forwardRef<
  HTMLAnchorElement,
  { userId: string | null; projectId: string } & ReferenceLinkProps
>(function UserIdBadge({ userId, projectId, ...props }, ref) {
  if (!userId) return null;

  return (
    <Link
      ref={ref}
      href={`/project/${projectId}/users/${encodeURIComponent(userId)}`}
      className={`ph-no-capture ${REFERENCE_LINK_CLASS}`}
      {...props}
    >
      User{" "}
      <span className="truncate" title={userId}>
        {userId}
      </span>
      <ArrowUpRight className="h-3 w-3 shrink-0" />
    </Link>
  );
});

export function TargetTraceBadge({
  targetTraceId,
  projectId,
}: {
  targetTraceId: string | null;
  projectId: string;
}) {
  if (!targetTraceId) return null;

  return (
    <Link
      href={`/project/${projectId}/traces/${encodeURIComponent(targetTraceId)}`}
      className={`ph-no-capture ${REFERENCE_LINK_CLASS}`}
    >
      target trace{" "}
      <span className="truncate" title={targetTraceId}>
        {targetTraceId}
      </span>
      <ArrowUpRight className="h-3 w-3 shrink-0" />
    </Link>
  );
}
