import { useQueryParams, withDefault, DateTimeParam } from "use-query-params";

export function useDatasetVersion() {
  const [queryParams, setQueryParams] = useQueryParams({
    version: withDefault(DateTimeParam, null),
  });

  const selectedVersion = queryParams.version;

  const setSelectedVersion = (version: Date | null) => {
    setQueryParams({ version }, "pushIn");
  };

  const resetToLatest = () => {
    setQueryParams({ version: undefined }, "pushIn");
  };

  return {
    selectedVersion,
    setSelectedVersion,
    resetToLatest,
  };
}
