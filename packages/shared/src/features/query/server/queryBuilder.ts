import { type z } from "zod";
import { shouldSkipScoresDedup } from "../../../server/queries/clickhouse-sql/query-options";
import {
  type QueryType,
  type ViewDeclarationType,
  type ViewVersion,
  type views,
  query as queryModel,
  SCORES_LISTABLE_COUNT_VIEW,
} from "../types";

import {
  eventsObservationsView,
  eventsTracesView,
  getViewDeclaration,
} from "../dataModel";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { env } from "../../../env";
import { buildScores, SCORE_VIEWS_V2 } from "./scoresQuery";
import { buildEventsObservations } from "./eventsObservationsQuery";
import { buildEventsTraces } from "./eventsTracesQuery";
import { buildSqlText } from "./sqlTextQuery";

export class QueryBuilder {
  private chartConfig?: { bins?: number; row_limit?: number };
  private version: ViewVersion;
  private rootEventConditionMaxWindowHours: number =
    env.LANGFUSE_ROOT_EVENT_CONDITION_MAX_WINDOW_HOURS;

  constructor(
    chartConfig?: { bins?: number; row_limit?: number },
    version: ViewVersion = "v1",
  ) {
    this.chartConfig = chartConfig;
    this.version = version;
  }

  setRootEventConditionMaxWindowHours(hours: number): void {
    this.rootEventConditionMaxWindowHours = hours;
  }

  private getViewDeclaration(
    viewName: z.infer<typeof views> | typeof SCORES_LISTABLE_COUNT_VIEW,
  ): ViewDeclarationType {
    return getViewDeclaration(viewName, this.version);
  }

  /**
   * The ClickHouse SQL and parameters of `query` for `projectId`. The v2
   * observations view ({@link buildEventsObservations}), the v2 traces view
   * ({@link buildEventsTraces}) and the v2 score views ({@link buildScores})
   * compile through the query AST; every other view and version is
   * assembled as SQL text ({@link buildSqlText}).
   *
   * Errors: `InvalidRequestError` for a query the schema or the view rejects.
   */
  public async build(
    query: QueryType,
    projectId: string,
    enableSingleLevelOptimization = false,
  ): Promise<{ query: string; parameters: Record<string, unknown> }> {
    const parseResult = queryModel.safeParse(query);
    if (!parseResult.success) {
      throw new InvalidRequestError(
        `Invalid query: ${JSON.stringify(parseResult.error.issues)}`,
      );
    }
    const view = this.getViewDeclaration(query.view);
    if (view === eventsObservationsView) {
      return buildEventsObservations(
        query,
        projectId,
        enableSingleLevelOptimization,
        shouldSkipScoresDedup(projectId),
        this.version,
        this.chartConfig,
      );
    }
    if (view === eventsTracesView) {
      return buildEventsTraces(
        query,
        projectId,
        enableSingleLevelOptimization,
        shouldSkipScoresDedup(projectId),
        this.version,
        this.chartConfig,
        this.rootEventConditionMaxWindowHours,
      );
    }
    if (SCORE_VIEWS_V2.has(view)) {
      return buildScores(
        query,
        view,
        projectId,
        shouldSkipScoresDedup(projectId),
        this.version,
        this.chartConfig,
      );
    }
    return buildSqlText(
      query,
      view,
      projectId,
      enableSingleLevelOptimization,
      this.version,
      this.chartConfig,
    );
  }
}
