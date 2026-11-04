/** DOM id / data-section-key for the Corrected output block in Preview. */
export const CORRECTED_OUTPUT_SECTION_ID = "corrected-output";

/** Scroll Preview's Corrected output into view after a tab switch if needed. */
export function scrollToCorrectedOutput() {
  const scroll = () => {
    document
      .getElementById(CORRECTED_OUTPUT_SECTION_ID)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  // Tab content may mount on the next frame after setSelectedTab("preview").
  requestAnimationFrame(() => {
    scroll();
    window.setTimeout(scroll, 50);
  });
}
