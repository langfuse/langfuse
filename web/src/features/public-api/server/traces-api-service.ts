import {
  _handleGenerateTracesForPublicApi,
  _handleGetTracesCountForPublicApi,
  type TraceQueryType,
} from "@/src/features/public-api/server/traces";
import { type OrderByState } from "@langfuse/shared";

export class TracesApiService {
  constructor(private readonly apiVersion: "v1" | "v2") {}

  /**
   * Get list of traces with version-aware filtering
   */
  async generateTracesForPublicApi(
    props: TraceQueryType,
    orderBy: OrderByState | null,
  ) {
    return _handleGenerateTracesForPublicApi({
      props,
      orderBy,
      traceScope: this.apiVersion === "v1" ? "traces_only" : "all",
    });
  }

  /**
   * Get count of traces with version-aware filtering
   */
  async getTracesCountForPublicApi(props: TraceQueryType) {
    return _handleGetTracesCountForPublicApi({
      props,
    });
  }
}
