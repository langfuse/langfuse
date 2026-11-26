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

import { getViewDeclaration } from "../dataModel";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { env } from "../../../env";
import { scoresAstView } from "./scoresQuery";
import { eventsObservationsAstView } from "./eventsObservationsQuery";
import { eventsTracesAstView } from "./eventsTracesQuery";
import { buildSqlText } from "./sqlTextQuery";
import { astViewsByDeclaration, type BuildContext } from "./astViewQuery";

/**
 * The builder of each declaration that compiles through the query AST;
 * `QueryBuilder.build` assembles every other one as SQL text.
 */
export const AST_VIEWS = astViewsByDeclaration([
  eventsObservationsAstView,
  eventsTracesAstView,
  scoresAstView,
]);

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

  /** The {@link BuildContext} of a `build` call for `projectId`. */
  private astContext(
    projectId: string,
    enableSingleLevelOptimization: boolean,
  ): BuildContext {
    return {
      projectId,
      version: this.version,
      chartConfig: this.chartConfig,
      enableSingleLevelOptimization,
      skipScoresFinal: shouldSkipScoresDedup(projectId),
      rootEventConditionMaxWindowHours: this.rootEventConditionMaxWindowHours,
    };
  }

  private getViewDeclaration(
    viewName: z.infer<typeof views> | typeof SCORES_LISTABLE_COUNT_VIEW,
  ): ViewDeclarationType {
    return getViewDeclaration(viewName, this.version);
  }

  /**
   * The ClickHouse SQL and parameters of `query` for `projectId`. The
   * declarations in {@link AST_VIEWS} compile through the query AST; every
   * other view and version is assembled as SQL text ({@link buildSqlText}).
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
    const astView = AST_VIEWS.get(view);
    if (astView) {
      return astView(
        query,
        view,
        this.astContext(projectId, enableSingleLevelOptimization),
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
