import { useQueryParams, StringParam, NumberParam, withDefault } from "use-query-params";

export function useFolderNavigation() {
  const [queryParams, setQueryParams] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
    folder: StringParam,
  });

  const currentFolderPath = queryParams.folder || "";

  const navigateToFolder = (folderPath: string | undefined) => {
    setQueryParams({
      folder: folderPath,
      pageIndex: 0,
      pageSize: queryParams.pageSize,
    });
  };

  return {
    currentFolderPath,
    navigateToFolder,
    queryParams,
    setQueryParams,
    paginationState: {
      pageIndex: queryParams.pageIndex,
      pageSize: queryParams.pageSize,
    },
  };
}