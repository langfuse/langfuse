import { AI_GATEWAY_SERVICE_NAME } from "@langfuse/shared";
import {
  convertDateToClickhouseDateTime,
  EventsAggQueryBuilder,
  queryClickhouse,
} from "@langfuse/shared/src/server";

import type { GatewaySpendLimitScope } from "./gatewaySpendLimitScope";

/**
 * USD a scope spent since each `since`, read from the gateway ingestion
 * project. One scan from the earliest `since` serves every window.
 */
export async function getGatewaySpendSince(params: {
  projectId: string;
  scope: GatewaySpendLimitScope;
  since: Date[];
}): Promise<number[]> {
  if (params.since.length === 0) return [];

  const earliest = new Date(
    Math.min(...params.since.map((since) => since.getTime())),
  );
  const sinceParams = Object.fromEntries(
    params.since.map((since, index) => [
      `since${index}`,
      convertDateToClickhouseDateTime(since),
    ]),
  );
  const selectExpression = params.since
    .map(
      (_, index) =>
        `toString(sumIf(e.total_cost, e.start_time >= {since${index}: DateTime64(3)})) as spend_${index}`,
    )
    .join(", ");

  const { column, value } = scopeFilter(params.scope);
  const { query, params: queryParams } = new EventsAggQueryBuilder({
    projectId: params.projectId,
    groupByColumn: column,
    selectExpression,
  })
    .whereRaw("e.start_time >= {earliest: DateTime64(3)}", {
      earliest: convertDateToClickhouseDateTime(earliest),
      ...sinceParams,
    })
    .whereRaw("e.service_name = {gatewayServiceName: String}", {
      gatewayServiceName: AI_GATEWAY_SERVICE_NAME,
    })
    .whereRaw(`${column} = {scopeValue: String}`, { scopeValue: value })
    .buildWithParams();

  const rows = await queryClickhouse<Record<string, string>>({
    query,
    params: queryParams,
    tags: { projectId: params.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  const row = rows[0];
  return params.since.map((_, index) => Number(row?.[`spend_${index}`] ?? 0));
}

/**
 * USD each gateway key spent since its own `since`, in one scan from the
 * earliest. Keys without spend in their window are absent from the result.
 */
export async function getGatewayApiKeysSpendSince(params: {
  projectId: string;
  apiKeys: { apiKeyId: string; since: Date }[];
}): Promise<{ id: string; spendUsd: number }[]> {
  if (params.apiKeys.length === 0) return [];

  const earliest = new Date(
    Math.min(...params.apiKeys.map(({ since }) => since.getTime())),
  );
  const { query, params: queryParams } = new EventsAggQueryBuilder({
    projectId: params.projectId,
    groupByColumn: "e.ingestion_api_key",
    selectExpression:
      "e.ingestion_api_key as api_key_id, toString(sum(e.total_cost)) as spend",
  })
    .whereRaw("e.start_time >= {earliest: DateTime64(3)}", {
      earliest: convertDateToClickhouseDateTime(earliest),
    })
    .whereRaw("e.service_name = {gatewayServiceName: String}", {
      gatewayServiceName: AI_GATEWAY_SERVICE_NAME,
    })
    .whereRaw("e.ingestion_api_key IN {apiKeyIds: Array(String)}", {
      apiKeyIds: params.apiKeys.map(({ apiKeyId }) => apiKeyId),
    })
    .whereRaw(
      "toUnixTimestamp64Milli(e.start_time) >= arrayElement({sinceMs: Array(Int64)}, indexOf({apiKeyIds: Array(String)}, e.ingestion_api_key))",
      { sinceMs: params.apiKeys.map(({ since }) => since.getTime()) },
    )
    .buildWithParams();

  const rows = await queryClickhouse<{ api_key_id: string; spend: string }>({
    query,
    params: queryParams,
    tags: { projectId: params.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  return rows.map((row) => ({
    id: row.api_key_id,
    spendUsd: Number(row.spend),
  }));
}

function scopeFilter(scope: GatewaySpendLimitScope) {
  switch (scope.type) {
    case "API_KEY":
      // Gateway ingestion stores the calling key id as `ingestion_api_key`.
      return { column: "e.ingestion_api_key", value: scope.apiKeyId };
  }
}
