/** DOM id / data-section-key for the Corrected output block in Preview. */
export const CORRECTED_OUTPUT_SECTION_ID = "corrected-output";

/** JSON Beta MultiSection key for the Output correction section. */
export const CORRECTIONS_SECTION_KEY = "corrections";

/**
 * Ask JSON Beta (and any other listener) to expand the corrections section
 * before we scroll — a collapsed section unmounts `#corrected-output`.
 */
export const EXPAND_CORRECTED_OUTPUT_EVENT = "langfuse:expand-corrected-output";

/** Scroll Preview's Corrected output into view after a tab switch if needed. */
export function scrollToCorrectedOutput() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EXPAND_CORRECTED_OUTPUT_EVENT));
  }

  const scroll = () => {
    document
      .getElementById(CORRECTED_OUTPUT_SECTION_ID)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  // Tab content / section expand may mount on the next frame(s).
  requestAnimationFrame(() => {
    scroll();
    window.setTimeout(scroll, 50);
    window.setTimeout(scroll, 150);
  });
}
