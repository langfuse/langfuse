import { type EvalsTemplateRow } from "@/src/features/evals/components/eval-templates-table";
import { type ListEntry } from "@/src/features/navigate-detail-pages/context";
import { useRouter } from "next/router";
import { getPathnameWithoutBasePath } from "@/src/utils/api";

export const useEvalTemplatesPeekNavigation = () => {
  const router = useRouter();
  const { projectId, peek } = router.query;

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

  const expandPeek = (openInNewTab: boolean, row?: EvalsTemplateRow) => {
    if (!row) return;
    const pathname = `/project/${projectId}/evals/templates/${encodeURIComponent(peek as string)}`;

    if (openInNewTab) {
      const pathnameWithBasePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${pathname}`;
      window.open(pathnameWithBasePath, "_blank");
    } else {
      router.push(pathname);
    }
  };

  return { getNavigationPath, expandPeek };
};
