import { type TracingSearchType } from "@langfuse/shared";
import { type ApiAccessLevel } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { type Session } from "next-auth";

import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { shadowAuthorize } from "@/src/features/public-api/server/shadowAuth";
import { hasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { LEGACY_IO_SEARCH_TYPES } from "@/src/features/traces/server/legacyIoSearchTypes";

const IO_FILTER_COLUMNS = new Set(["input", "output"]);

export function hasSessionProjectMembership(
  session: Session | null | undefined,
  projectId: string,
): boolean {
  return Boolean(
    session?.user?.organizations.some((org) =>
      org.projects.some((project) => project.id === projectId),
    ),
  );
}

/**
 * Determines whether a session may read trace/observation message payloads
 * (`input`, `output`, `toolCalls`, `toolDefinitions`, transcripts, downloads).
 * Authenticated project members must hold `traces:readMessage`; unauthenticated
 * visitors may only read public traces/sessions.
 */
export function canSessionReadTraceMessages(params: {
  session: Session | null | undefined;
  projectId: string;
  isPublic?: boolean;
}): boolean {
  const { session, projectId, isPublic = false } = params;
  if (hasSessionProjectMembership(session, projectId)) {
    return hasProjectAccess({
      session: session ?? null,
      projectId,
      scope: "traces:readMessage",
    });
  }
  return isPublic;
}

export function hasIoFilterColumn(
  filter?: readonly { column: string }[] | null,
): boolean {
  if (!filter || filter.length === 0) return false;
  return filter.some((condition) =>
    IO_FILTER_COLUMNS.has(condition.column.toLowerCase()),
  );
}

/**
 * Prevents search/filter oracle leaks over `input`/`output` when the caller
 * lacks `traces:readMessage`. Rejects explicit `input`/`output` column filters
 * and downgrades `content`/`input`/`output` search types to non-IO types.
 */
export function enforceTraceMessageSearchAndFilterAccess<
  TFilter extends readonly { column: string }[] | null | undefined = undefined,
>(params: {
  canReadMessages: boolean;
  searchQuery?: string | null;
  searchType?: TracingSearchType[] | null;
  filter?: TFilter;
}): {
  searchQuery: string | undefined;
  searchType: TracingSearchType[];
  filter: TFilter;
} {
  const { canReadMessages, searchQuery, searchType, filter } = params;
  const resolvedSearchType = searchType ?? [];

  if (canReadMessages) {
    return {
      searchQuery: searchQuery ?? undefined,
      searchType: resolvedSearchType,
      filter: filter as TFilter,
    };
  }

  if (hasIoFilterColumn(filter)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Filtering by trace input or output requires the traces:readMessage permission.",
    });
  }

  if (
    resolvedSearchType.length === 0 ||
    !resolvedSearchType.some((t) => LEGACY_IO_SEARCH_TYPES.has(t))
  ) {
    return {
      searchQuery: searchQuery ?? undefined,
      searchType: resolvedSearchType,
      filter: filter as TFilter,
    };
  }

  const sanitizedSearchType = resolvedSearchType.filter(
    (type) => !LEGACY_IO_SEARCH_TYPES.has(type),
  );

  if (sanitizedSearchType.length > 0) {
    return {
      searchQuery: searchQuery ?? undefined,
      searchType: sanitizedSearchType,
      filter: filter as TFilter,
    };
  }

  return {
    searchQuery: undefined,
    searchType: ["id"],
    filter: filter as TFilter,
  };
}

export function checkApiTraceMessageAccess(params: {
  ctx: AuthorizationContext | undefined;
  projectId: string;
  accessLevel: ApiAccessLevel;
}) {
  return shadowAuthorize({
    ctx: params.ctx,
    action: "traces:readMessage",
    resource: { projectId: params.projectId },
    legacyDecision: {
      success: true,
      scope: { accessLevel: params.accessLevel },
    },
  });
}

export function assertApiTraceMessageAccess(params: {
  ctx: AuthorizationContext | undefined;
  projectId: string;
  accessLevel: ApiAccessLevel;
}): void {
  const decision = checkApiTraceMessageAccess(params);
  if (!decision.success) {
    throw decision.error;
  }
}
