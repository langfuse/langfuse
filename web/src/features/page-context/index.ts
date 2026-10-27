// The page-context feature's public client surface. Pages publish what they
// show; the assistant reads the active snapshot when the user hands it a page.
export {
  PageContextProvider,
  usePageContextStore,
  usePublishPageContext,
} from "@/src/features/page-context/PageContextProvider";
export { buildTracePageContext } from "@/src/features/page-context/fns/buildTracePageContext";
export { buildRoutePageContext } from "@/src/features/page-context/fns/buildRoutePageContext";
export { buildPromptPageContext } from "@/src/features/page-context/fns/buildPromptPageContext";
export type { PageContextStore } from "@/src/features/page-context/pageContextStore";
export {
  PageContextSnapshotSchema,
  PAGE_CONTEXT_LIMITS,
  type CapturedPageContext,
  type PageContextFact,
  type PageContextKind,
  type PageContextSnapshot,
  type PageContextSurface,
} from "@/src/features/page-context/types";
