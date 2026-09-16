import { use } from "react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";

export type SectionLayout = "boxes" | "dividers";

/** Review-only switch: `?sections=dividers` on any page. Remove before merge. */
export function useSectionLayoutDebug(): SectionLayout {
  const router = use(RouterContext);
  return router?.query.sections === "dividers" ? "dividers" : "boxes";
}
