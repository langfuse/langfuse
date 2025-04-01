import { ListEntry } from "@/src/features/navigate-detail-pages/context";

export const useDatasetComparePeekNavigation = (urlPathname: string) => {
  const getNavigationPath = (entry: ListEntry) => {
    const url = new URL(window.location.href);
    url.pathname = urlPathname;
    url.searchParams.set("peek", entry.id);
    return url.toString();
  };

  return { getNavigationPath };
};
