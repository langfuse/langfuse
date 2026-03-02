/**
 * Public API data layer: re-exports traces, observations, scores, and daily metrics
 * from serverOb when OceanBase is enabled, otherwise from the default ClickHouse server.
 * This is the single switch point for routing Public API to OceanBase.
 */
import { isOceanBase } from "@langfuse/shared/src/server";

// Types are identical between server and serverOb; use server for type exports
export type { ScoreQueryType } from "./scores";

const tracesModule = isOceanBase()
  ? require("../serverOb/traces")
  : require("./traces");
export const generateTracesForPublicApi: typeof import("./traces").generateTracesForPublicApi =
  tracesModule.generateTracesForPublicApi;
export const getTracesCountForPublicApi: typeof import("./traces").getTracesCountForPublicApi =
  tracesModule.getTracesCountForPublicApi;

const observationsModule = isOceanBase()
  ? require("../serverOb/observations")
  : require("./observations");
export const generateObservationsForPublicApi: typeof import("./observations").generateObservationsForPublicApi =
  observationsModule.generateObservationsForPublicApi;
export const getObservationsCountForPublicApi: typeof import("./observations").getObservationsCountForPublicApi =
  observationsModule.getObservationsCountForPublicApi;

const dailyMetricsModule = isOceanBase()
  ? require("../serverOb/dailyMetrics")
  : require("./dailyMetrics");
export const generateDailyMetrics = dailyMetricsModule.generateDailyMetrics;
export const getDailyMetricsCount = dailyMetricsModule.getDailyMetricsCount;

const scoresModule = isOceanBase()
  ? require("../serverOb/scores")
  : require("./scores");
export const _handleGenerateScoresForPublicApi =
  scoresModule._handleGenerateScoresForPublicApi;
export const _handleGetScoresCountForPublicApi =
  scoresModule._handleGetScoresCountForPublicApi;
export const convertScoreToPublicApi = scoresModule.convertScoreToPublicApi;
