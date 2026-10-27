import { truncateText } from "@/src/features/page-context/fns/pageContextFormatting";
import {
  PAGE_CONTEXT_LIMITS,
  type PageContextSnapshot,
} from "@/src/features/page-context/types";

const TITLE_SUFFIX = /\s*\|\s*Langfuse\s*$/;

/**
 * The context of a page that publishes nothing richer: where the user is, by
 * route and document title. Keeps every page attachable, if less informative.
 */
export function buildRoutePageContext(params: {
  path: string;
  documentTitle: string;
}): PageContextSnapshot {
  const title = params.documentTitle.replace(TITLE_SUFFIX, "").trim();
  return {
    version: 1,
    kind: "page",
    label: "Page",
    title: truncateText(title || "Current page", PAGE_CONTEXT_LIMITS.title),
    facts: [],
    surface: "page",
    path: truncateText(params.path, PAGE_CONTEXT_LIMITS.path),
  };
}
