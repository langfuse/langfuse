import { type Session } from "next-auth";
import { type FilterState, InvalidRequestError } from "@langfuse/shared";
import {
  isTopicFilter,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import { canViewTopics } from "@/src/features/topics/topicsAccess";

/** canViewTopics on the server: the allowlist comes from env, so admins outside the project are covered too. */
export function canViewTopicsOnServer(
  session: Session | null,
  projectId: string,
) {
  return canViewTopics(session, {
    id: projectId,
    topicsEnabled: isTopicsProjectEnabled(projectId),
  });
}

/** Topic filters on the tracing table follow the same gate as every other Topics surface. */
export function throwIfTopicFiltersNotAllowed(
  session: Session | null,
  projectId: string,
  filter: FilterState,
) {
  if (filter.some(isTopicFilter) && !canViewTopicsOnServer(session, projectId))
    throw new InvalidRequestError("Topic filters are not available.");
}
