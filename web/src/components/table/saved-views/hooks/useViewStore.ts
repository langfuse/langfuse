import { StringParam, useQueryParam, withDefault } from "use-query-params";

type UseViewStoreProps = {};

export const useViewStore = () => {
  const [selectedViewId, setSelectedViewId] = useQueryParam(
    "viewId",
    withDefault(StringParam, null),
  );

  return {
    selectedViewId,
    setSelectedViewId,
  };
};
