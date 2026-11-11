import { AI_GATEWAY_SERVICE_NAME } from "@langfuse/shared";
import {
  convertDateToClickhouseDateTime,
  EventsAggQueryBuilder,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "@langfuse/shared/src/server";

/**
 * Latest gateway request per gateway key in the gateway ingestion project.
 *
 * Gateway ingestion stores the calling gateway key id as `ingestion_api_key`
 * and `langfuse-ai-gateway` as `service_name`. `project_id` and the
 * `start_time` lower bound are the events_core primary key prefix and
 * partition key, so ClickHouse reads only the project's granules since
 * `since`. Keys without traffic in that window are absent from the result.
 */
export async function getGatewayApiKeysLastUsedAt(params: {
  projectId: string;
  apiKeyIds: string[];
  since: Date;
}) {
  if (params.apiKeyIds.length === 0) return [];

  const { query, params: queryParams } = new EventsAggQueryBuilder({
    projectId: params.projectId,
    groupByColumn: "e.ingestion_api_key",
    selectExpression:
      "e.ingestion_api_key as api_key_id, max(e.start_time) as last_used_at",
  })
    .whereRaw("e.start_time >= {since: DateTime64(3)}", {
      since: convertDateToClickhouseDateTime(params.since),
    })
    .whereRaw("e.service_name = {gatewayServiceName: String}", {
      gatewayServiceName: AI_GATEWAY_SERVICE_NAME,
    })
    .whereRaw("e.ingestion_api_key IN {apiKeyIds: Array(String)}", {
      apiKeyIds: params.apiKeyIds,
    })
    .buildWithParams();

  const rows = await queryClickhouse<{
    api_key_id: string;
    last_used_at: string;
  }>({
    query,
    params: queryParams,
    tags: { projectId: params.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  return rows.map((row) => ({
    id: row.api_key_id,
    lastUsedAt: parseClickhouseUTCDateTimeFormat(row.last_used_at),
  }));
}
