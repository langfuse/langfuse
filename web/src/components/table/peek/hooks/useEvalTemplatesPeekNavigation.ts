import { type EvalsTemplateRow } from "@/src/features/evals/components/eval-templates-table";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { useRouter } from "next/router";

export const useEvalTemplatesPeekNavigation = (urlPathname: string) => {
  const router = useRouter();
  const { projectId, peek } = router.query;

  const getNavigationPath = (entry: ListEntry) => {
    const url = new URL(window.location.href);

    // Update the path part
    url.pathname = urlPathname;

    // Keep all existing query params
    const params = new URLSearchParams(url.search);

    // Update peek param to the new id
    params.set("peek", entry.id);

    // Set the search part of the URL
    return `${url.pathname}?${params.toString()}`;
  };

  const expandPeek = (openInNewTab: boolean, row?: EvalsTemplateRow) => {
    if (!row) return;
    const pathname = `/project/${projectId}/evals/templates/${encodeURIComponent(peek as string)}`;

    if (openInNewTab) {
      window.open(pathname, "_blank");
    } else {
      router.push(pathname);
    }
  };

  return { getNavigationPath, expandPeek };
};
