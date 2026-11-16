import { AI_GATEWAY_SERVICE_NAME } from "@langfuse/shared";
import {
  convertDateToClickhouseDateTime,
  EventsAggQueryBuilder,
  queryClickhouse,
} from "@langfuse/shared/src/server";

/**
 * USD a gateway key spent since each `since`, read from the gateway ingestion
 * project. Gateway ingestion stores the calling key id as `ingestion_api_key`;
 * one scan from the earliest `since` serves every window.
 */
export async function getGatewayApiKeySpendSince(params: {
  projectId: string;
  apiKeyId: string;
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

  const { query, params: queryParams } = new EventsAggQueryBuilder({
    projectId: params.projectId,
    groupByColumn: "e.ingestion_api_key",
    selectExpression,
  })
    .whereRaw("e.start_time >= {earliest: DateTime64(3)}", {
      earliest: convertDateToClickhouseDateTime(earliest),
      ...sinceParams,
    })
    .whereRaw("e.service_name = {gatewayServiceName: String}", {
      gatewayServiceName: AI_GATEWAY_SERVICE_NAME,
    })
    .whereRaw("e.ingestion_api_key = {apiKeyId: String}", {
      apiKeyId: params.apiKeyId,
    })
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
