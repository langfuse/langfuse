import { type LangfuseItemType } from "@/src/components/ItemBadge";
import { useRouter } from "next/router";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";

const mapItemTypeToPageUrl: Partial<Record<LangfuseItemType, string>> = {
  TRACE: "traces",
} as const;

export const usePeekViewNavigation = (itemType: LangfuseItemType) => {
  const router = useRouter();
  const pageUrl = mapItemTypeToPageUrl[itemType];

  const getNavigationPath = (entry: ListEntry): string => {
    if (!pageUrl) {
      throw new Error(`No page URL mapping found for item type: ${itemType}`);
    }

    const { projectId } = router.query;
    const url = new URL(window.location.href);

    // Update the path part
    url.pathname = `/project/${projectId as string}/${pageUrl}`;

    // Keep all existing query params
    const params = new URLSearchParams(url.search);

    // Update timestamp if it exists in entry.params
    if (entry.params) {
      if (entry.params.timestamp) {
        params.set("timestamp", encodeURIComponent(entry.params.timestamp));
      }
      params.delete("observation");
    }

    // Update peek param to the new id
    params.set("peek", entry.id);

    // Set the search part of the URL
    return `${url.pathname}?${params.toString()}`;
  };

  const expandView = (id: string, openInNewTab: boolean) => {
    if (!pageUrl) return;

    const url = `/project/${router.query.projectId as string}/${pageUrl}/${encodeURIComponent(id)}`;
    if (openInNewTab) {
      window.open(url, "_blank");
    } else {
      void router.replace(url);
    }
  };

  return {
    getNavigationPath,
    expandView,
    pageUrl,
  };
};
