import { type Session } from "next-auth";
import { InvalidRequestError, type TracingSearchType } from "@langfuse/shared";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
import { canViewTopics } from "@/src/features/topics/topicsAccess";

/**
 * Summary search exposes Topics summary text, so it needs the full Topics
 * visibility gate, not just the project allowlist. The `summary` lane only
 * exists on the events tables.
 */
export function assertTopicSummarySearchAllowed({
  session,
  projectId,
  searchQuery,
  searchType,
  readsEventsTable,
}: {
  /** Partial because the session-detail tRPC context also serves anonymous viewers of public sessions. */
  session: Partial<Session> | null;
  projectId: string;
  searchQuery?: string | null;
  searchType?: TracingSearchType[] | null;
  readsEventsTable: boolean;
}) {
  if (!searchQuery || !searchType?.includes("summary")) return;
  if (!readsEventsTable)
    throw new InvalidRequestError(
      "Searching trace summaries is not supported for this table or action.",
    );
  const project = {
    id: projectId,
    topicsEnabled: isTopicsProjectEnabled(projectId),
  };
  const signedIn =
    session?.user && session.environment
      ? {
          expires: session.expires ?? "",
          user: session.user,
          environment: session.environment,
        }
      : null;
  if (!canViewTopics(signedIn, project))
    throw new InvalidRequestError(
      "Searching trace summaries requires access to Topics in this project.",
    );
}
