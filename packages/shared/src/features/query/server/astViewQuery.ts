/**
 * The dashboard views that compile through the query AST: what one call of
 * `QueryBuilder.build` hands them ({@link BuildContext}).
 */
import type { ViewVersion } from "../types";

/** What `QueryBuilder` knows about one `build` call besides the query and its view. */
export type BuildContext = {
  /** The project the query is compiled for (tenancy). */
  projectId: string;
  version: ViewVersion;
  /** Histogram bins and row limit. */
  chartConfig: { bins?: number; row_limit?: number } | undefined;
  /** The caller allows a single-level query where the view can build one. */
  enableSingleLevelOptimization: boolean;
  /** The project never updates its scores, so they are read without `FINAL`. */
  skipScoresFinal: boolean;
  /** Longest window the v2 traces view restricts to root events on; 0: every window. */
  rootEventConditionMaxWindowHours: number;
};
