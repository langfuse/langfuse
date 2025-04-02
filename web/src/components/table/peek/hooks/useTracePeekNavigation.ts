import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { useRouter } from "next/router";

export const useTracePeekNavigation = (urlPathname: string) => {
  const router = useRouter();
  const { projectId, peek } = router.query;

  const getNavigationPath = (entry: ListEntry) => {
    const url = new URL(window.location.href);

    // Update the path part
    url.pathname = urlPathname;

    // Keep all existing query params
    const params = new URLSearchParams(url.search);

    // Update timestamp if it exists in entry.params
    if (entry.params) {
      if (entry.params.timestamp)
        params.set("timestamp", encodeURIComponent(entry.params.timestamp));
      params.delete("observation");
    }

    // Update peek param to the new id
    params.set("peek", entry.id);

    // Set the search part of the URL
    return `${url.pathname}?${params.toString()}`;
  };

  const expandPeek = (openInNewTab: boolean) => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const timestamp = params.get("timestamp");
    const display = params.get("display") ?? "details";

    const pathname = `/project/${projectId}/traces/${encodeURIComponent(peek as string)}?timestamp=${timestamp}&display=${display}`;

    if (openInNewTab) {
      window.open(pathname, "_blank");
    } else {
      router.push(pathname);
    }
  };

  return { getNavigationPath, expandPeek };
};
