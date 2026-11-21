import { useId } from "react";

/** A per-instance prefix for ids, safe inside url(#…). */
export function useIllustrationId() {
  return `ill${useId().replace(/[^\w-]/g, "")}`;
}
