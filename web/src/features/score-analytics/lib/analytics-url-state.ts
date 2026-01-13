import { useQueryParams, StringParam, withDefault } from "use-query-params";

export type ObjectType =
  | "all"
  | "trace"
  | "session"
  | "observation"
  | "dataset_run";

export interface ScoreAnalyticsUrlState {
  score1?: string;
  score2?: string;
  dateRange: string;
  objectType: ObjectType;
}

const DEFAULT_DATE_RANGE = "1d";
const DEFAULT_OBJECT_TYPE: ObjectType = "all";

/**
 * Hook to manage URL state for the Score Analytics page
 * Uses use-query-params for URL synchronization
 */
export function useAnalyticsUrlState() {
  const [query, setQuery] = useQueryParams({
    score1: StringParam,
    score2: StringParam,
    dateRange: withDefault(StringParam, DEFAULT_DATE_RANGE),
    objectType: withDefault(StringParam, DEFAULT_OBJECT_TYPE),
  });

  const state: ScoreAnalyticsUrlState = {
    score1: query.score1 ?? undefined,
    score2: query.score2 ?? undefined,
    dateRange: query.dateRange,
    objectType: query.objectType as ObjectType,
  };

  const setState = (newState: Partial<ScoreAnalyticsUrlState>) => {
    setQuery(newState as any, "pushIn");
  };

  const setScore1 = (score: string | undefined) => {
    setState({ score1: score });
  };

  const setScore2 = (score: string | undefined) => {
    setState({ score2: score });
  };

  const setDateRange = (dateRange: string) => {
    setState({ dateRange });
  };

  const setObjectType = (objectType: ObjectType) => {
    setState({ objectType });
  };

  const clearScores = () => {
    setState({ score1: undefined, score2: undefined });
  };

  return {
    state,
    setState,
    setScore1,
    setScore2,
    setDateRange,
    setObjectType,
    clearScores,
  };
}
