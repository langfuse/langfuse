import { useMemo } from "react";
import { ArrayParam, useQueryParams, withDefault } from "use-query-params";
import type { FilterState } from "@langfuse/shared";

import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

/**
 * User and API key selections, kept in the URL so the filters in the page
 * title row and the dashboard below share them. Values are IDs; options show
 * member and API key names. Viewers without the User filter ignore a shared
 * `users` param, since they would have no control to clear it.
 */
export function useGatewayAnalyticsFilters({
  labels,
  apiKeyOwnerById,
  canFilterByUser,
}: {
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
  apiKeyOwnerById: ReadonlyMap<string, string | null>;
  canFilterByUser: boolean;
}) {
  const [query, setQuery] = useQueryParams({
    users: withDefault(ArrayParam, []),
    gatewayKeys: withDefault(ArrayParam, []),
  });
  const userIds = useMemo(
    () => (canFilterByUser ? withoutNulls(query.users) : []),
    [canFilterByUser, query.users],
  );
  const rawApiKeyIds = useMemo(
    () => withoutNulls(query.gatewayKeys),
    [query.gatewayKeys],
  );
  const apiKeyIds = useMemo(
    () => filterMatchingGatewayKeys(rawApiKeyIds, userIds, apiKeyOwnerById),
    [rawApiKeyIds, userIds, apiKeyOwnerById],
  );

  const filters = useMemo(
    () => [
      ...anyOf("aiGatewayKeyOwnerUserId", userIds),
      ...anyOf("aiGatewayKeyId", apiKeyIds),
    ],
    [userIds, apiKeyIds],
  );

  const userOptions = useMemo(() => toOptions(labels.users), [labels.users]);
  const apiKeyOptions = useMemo(
    () => toApiKeyOptions(labels.apiKeys, userIds, apiKeyOwnerById),
    [labels.apiKeys, userIds, apiKeyOwnerById],
  );

  return {
    filters,
    user: {
      values: userIds,
      options: userOptions,
      onValueChange: (values: string[]) =>
        setQuery(
          nextUserQuery(values, apiKeyIds, rawApiKeyIds, apiKeyOwnerById),
        ),
    },
    apiKey: {
      values: apiKeyIds,
      options: apiKeyOptions,
      onValueChange: (values: string[]) => setQuery({ gatewayKeys: values }),
    },
  };
}

function withoutNulls(values: readonly (string | null)[]): string[] {
  return values.filter((value): value is string => value !== null);
}

function toOptions(labelMap: ReadonlyMap<string, string>) {
  return [...labelMap].map(([value, label]) => ({ value, label }));
}

function toApiKeyOptions(
  labelMap: ReadonlyMap<string, string>,
  userIds: readonly string[],
  apiKeyOwnerById: ReadonlyMap<string, string | null>,
) {
  if (userIds.length === 0) return toOptions(labelMap);
  const selectedUsers = new Set(userIds);
  const options: { value: string; label: string }[] = [];
  for (const [value, label] of labelMap) {
    const ownerUserId = apiKeyOwnerById.get(value);
    if (
      ownerUserId !== null &&
      ownerUserId !== undefined &&
      selectedUsers.has(ownerUserId)
    ) {
      options.push({ value, label });
    }
  }
  return options;
}

function nextUserQuery(
  users: string[],
  apiKeyIds: string[],
  rawApiKeyIds: readonly string[],
  apiKeyOwnerById: ReadonlyMap<string, string | null>,
) {
  const nextGatewayKeys = filterMatchingGatewayKeys(
    apiKeyIds,
    users,
    apiKeyOwnerById,
  );
  const gatewayKeysChanged =
    nextGatewayKeys.length !== rawApiKeyIds.length ||
    nextGatewayKeys.some((id, index) => id !== rawApiKeyIds[index]);
  return gatewayKeysChanged
    ? { users, gatewayKeys: nextGatewayKeys }
    : { users };
}

/**
 * Keeps selected keys that can still match `userIds`. Keys absent from
 * `apiKeyOwnerById` (custom/deleted IDs, or while labels are still loading)
 * are kept since their owner is unknown.
 */
function filterMatchingGatewayKeys(
  apiKeyIds: string[],
  userIds: readonly string[],
  apiKeyOwnerById: ReadonlyMap<string, string | null>,
): string[] {
  if (userIds.length === 0 || apiKeyIds.length === 0) return apiKeyIds;
  const selectedUsers = new Set(userIds);
  return apiKeyIds.filter((keyId) => {
    if (!apiKeyOwnerById.has(keyId)) return true;
    const ownerUserId = apiKeyOwnerById.get(keyId);
    return (
      ownerUserId !== null &&
      ownerUserId !== undefined &&
      selectedUsers.has(ownerUserId)
    );
  });
}

function anyOf(column: string, values: string[]): FilterState {
  if (values.length === 0) return [];
  return [{ column, operator: "any of", value: values, type: "stringOptions" }];
}
