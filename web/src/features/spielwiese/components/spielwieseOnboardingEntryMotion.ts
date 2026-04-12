export type EntryTextMotionDelay =
  | "long"
  | "medium"
  | "none"
  | "short"
  | 0
  | 50
  | 100
  | 150
  | 200
  | 250
  | 300
  | 350
  | 700
  | 1050
  | 1400
  | 1750
  | 2100
  | 2450;

const entryTextMotionDelayClassNames: Record<EntryTextMotionDelay, string> = {
  none: "[transition-delay:0ms]",
  short: "[transition-delay:70ms]",
  medium: "[transition-delay:140ms]",
  long: "[transition-delay:210ms]",
  0: "[transition-delay:0ms]",
  50: "[transition-delay:50ms]",
  100: "[transition-delay:100ms]",
  150: "[transition-delay:150ms]",
  200: "[transition-delay:200ms]",
  250: "[transition-delay:250ms]",
  300: "[transition-delay:300ms]",
  350: "[transition-delay:350ms]",
  700: "[transition-delay:700ms]",
  1050: "[transition-delay:1050ms]",
  1400: "[transition-delay:1400ms]",
  1750: "[transition-delay:1750ms]",
  2100: "[transition-delay:2100ms]",
  2450: "[transition-delay:2450ms]",
};

export function getOnboardingEntryTextMotionClassName(
  isActive: boolean,
  delay: EntryTextMotionDelay = "none",
) {
  return [
    "transition-[opacity,transform,filter] duration-[520ms] ease-[cubic-bezier(0.23,1,0.32,1)] will-change-auto",
    entryTextMotionDelayClassNames[delay],
    isActive
      ? "translate-y-0 opacity-100 blur-0"
      : "translate-y-2.5 opacity-0 blur-[10px]",
  ].join(" ");
}
