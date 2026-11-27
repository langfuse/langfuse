import { cn } from "@/src/utils/tailwind";

const typeClassName = {
  /** A tab label of the design-system tabs. */
  tab: "text-sm leading-normal",
  /** Body text, e.g. the value of a select. */
  text: "text-sm",
  /** A medium stepper title. */
  stepTitle: "text-base font-bold",
  /** Small toolbar text without extra leading. */
  caption: "text-xs leading-none",
} as const;

/**
 * Zero-width text, set like the first line of a control. As the first item of
 * a row it gives that row a text baseline, for controls whose first line
 * starts with an icon.
 */
export function BaselineStrut({ type }: { type: keyof typeof typeClassName }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex w-0 shrink-0 items-center", typeClassName[type])}
    >
      {"​"}
    </span>
  );
}
