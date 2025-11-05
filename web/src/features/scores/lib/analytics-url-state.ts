import {
  useQueryParams,
  StringParam,
  BooleanParam,
  withDefault,
} from "use-query-params";

export type ObjectType = "all" | "trace" | "session" | "observation" | "run";

export interface ScoreAnalyticsUrlState {
  score1?: string;
  score2?: string;
  dateRange: string;
  objectType: ObjectType;
  matchedOnly: boolean;
}

const DEFAULT_DATE_RANGE = "1d";
const DEFAULT_OBJECT_TYPE: ObjectType = "all";
const DEFAULT_MATCHED_ONLY = false;

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
    matchedOnly: withDefault(BooleanParam, DEFAULT_MATCHED_ONLY),
  });

  const state: ScoreAnalyticsUrlState = {
    score1: query.score1 ?? undefined,
    score2: query.score2 ?? undefined,
    dateRange: query.dateRange,
    objectType: query.objectType as ObjectType,
    matchedOnly: query.matchedOnly,
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

  const setMatchedOnly = (matchedOnly: boolean) => {
    setState({ matchedOnly });
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
    setMatchedOnly,
    clearScores,
  };
}
