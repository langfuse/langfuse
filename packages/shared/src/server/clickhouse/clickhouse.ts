import { createClient } from "@clickhouse/client";

import { env } from "../../env";
import { eventTypes } from "../ingestion/types";
import { LangfuseNotFoundError } from "../../errors";

export enum ClickhouseEntityType {
  Trace = "trace",
  Score = "score",
  Observation = "observation",
  SdkLog = "sdk-log",
}

export function getClickhouseEntityType(
  eventType: string
): ClickhouseEntityType {
  switch (eventType) {
    case eventTypes.TRACE_CREATE:
      return ClickhouseEntityType.Trace;
    case eventTypes.OBSERVATION_CREATE:
    case eventTypes.OBSERVATION_UPDATE:
    case eventTypes.EVENT_CREATE:
    case eventTypes.SPAN_CREATE:
    case eventTypes.SPAN_UPDATE:
    case eventTypes.GENERATION_CREATE:
    case eventTypes.GENERATION_UPDATE:
      return ClickhouseEntityType.Observation;
    case eventTypes.SCORE_CREATE:
      return ClickhouseEntityType.Score;
    case eventTypes.SDK_LOG:
      return ClickhouseEntityType.SdkLog;
    default:
      throw new LangfuseNotFoundError(`Unknown event type: ${eventType}`);
  }
}

export type ClickhouseClientType = ReturnType<typeof createClient>;

export const clickhouseClient = createClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  database: "default",
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 1, // if disabled, we won't get errors from clickhouse
  },
});
