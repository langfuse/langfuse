import { useMemo } from "react";
import { ArrayParam, useQueryParams, withDefault } from "use-query-params";
import type { FilterState } from "@langfuse/shared";

import type { GatewayAnalyticsLabelSource } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/types/gatewayAnalyticsWidget";

/**
 * User and API key selections, kept in the URL so the filters in the page
 * title row and the dashboard below share them. Values are IDs; options show
 * member and API key names.
 */
export function useGatewayAnalyticsFilters({
  labels,
}: {
  labels: Record<GatewayAnalyticsLabelSource, ReadonlyMap<string, string>>;
}) {
  const [query, setQuery] = useQueryParams({
    users: withDefault(ArrayParam, []),
    gatewayKeys: withDefault(ArrayParam, []),
  });
  const userIds = useMemo(() => withoutNulls(query.users), [query.users]);
  const apiKeyIds = useMemo(
    () => withoutNulls(query.gatewayKeys),
    [query.gatewayKeys],
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
    () => toOptions(labels.apiKeys),
    [labels.apiKeys],
  );

  return {
    filters,
    user: {
      values: userIds,
      options: userOptions,
      onValueChange: (values: string[]) => setQuery({ users: values }),
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

function anyOf(column: string, values: string[]): FilterState {
  if (values.length === 0) return [];
  return [{ column, operator: "any of", value: values, type: "stringOptions" }];
}
