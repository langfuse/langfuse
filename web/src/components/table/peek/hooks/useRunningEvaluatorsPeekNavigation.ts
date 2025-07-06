import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { getPathnameWithoutBasePath } from "@/src/utils/api";

export const useRunningEvaluatorsPeekNavigation = () => {
  const getNavigationPath = (entry: ListEntry) => {
    const url = new URL(window.location.href);
    const pathname = getPathnameWithoutBasePath();

    // Update the path part
    url.pathname = pathname;

    // Keep all existing query params
    const params = new URLSearchParams(url.search);

    // Update peek param to the new id
    params.set("peek", entry.id);

    // Set the search part of the URL
    return `${url.pathname}?${params.toString()}`;
  };

  return { getNavigationPath };
};
