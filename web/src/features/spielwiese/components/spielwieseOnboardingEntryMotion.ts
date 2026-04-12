export type EntryTextMotionDelay =
  | "long"
  | "medium"
  | "none"
  | "short"
  | 0
  | 250
  | 500
  | 750
  | 1000
  | 1250
  | 1500
  | 1750
  | 2000;

const entryTextMotionDelayClassNames: Record<EntryTextMotionDelay, string> = {
  none: "[transition-delay:0ms]",
  short: "[transition-delay:70ms]",
  medium: "[transition-delay:140ms]",
  long: "[transition-delay:210ms]",
  0: "[transition-delay:0ms]",
  250: "[transition-delay:250ms]",
  500: "[transition-delay:500ms]",
  750: "[transition-delay:750ms]",
  1000: "[transition-delay:1000ms]",
  1250: "[transition-delay:1250ms]",
  1500: "[transition-delay:1500ms]",
  1750: "[transition-delay:1750ms]",
  2000: "[transition-delay:2000ms]",
};

export function getOnboardingEntryTextMotionClassName(
  isActive: boolean,
  delay: EntryTextMotionDelay = "none",
) {
  return [
    "transition-[opacity,transform,filter] duration-[360ms] ease-[cubic-bezier(0.23,1,0.32,1)] will-change-auto",
    entryTextMotionDelayClassNames[delay],
    isActive
      ? "translate-y-0 opacity-100 blur-0"
      : "translate-y-3 opacity-0 blur-[8px]",
  ].join(" ");
}
