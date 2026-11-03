import { type ReactNode, type Ref } from "react";
import { X } from "@langfuse/icons";
import { cva, type VariantProps } from "class-variance-authority";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

const topBannerVariants = cva(
  "flex w-full flex-col gap-1 px-4 py-1.5 sm:flex-row sm:items-center sm:gap-3 sm:py-1",
  {
    variants: {
      severity: {
        info: "bg-foreground text-background",
        warning:
          "bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50",
        critical: "bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      severity: "info",
    },
  },
);

export type TopBannerSeverity = NonNullable<
  VariantProps<typeof topBannerVariants>["severity"]
>;

export type TopBannerViewProps = VariantProps<typeof topBannerVariants> & {
  /** Leading icon; size it `base` and offset it with `mt-0.5 sm:mt-0`. */
  icon: ReactNode;
  /** Bold lead-in rendered inline before the message. */
  title: ReactNode;
  /** Message following the title in the same paragraph. */
  children: ReactNode;
  /** Trailing controls, such as a billing action. */
  actions?: ReactNode;
  /** Renders a close button when set. */
  onClose?: () => void;
  role?: "alert" | "status";
  ref?: Ref<HTMLDivElement>;
};

/**
 * Full-width strip for the fixed top-banner stack in `AuthenticatedLayout`.
 * Icon, then the message as one paragraph flow with the title as a bold inline
 * span, then the actions — so narrow widths reflow the whole sentence instead
 * of squeezing a title column. Below `sm` the actions drop to their own row so
 * the message keeps the full width instead of wrapping beside it.
 */
export function TopBannerView({
  icon,
  title,
  children,
  actions,
  onClose,
  severity,
  role = "alert",
  ref,
}: TopBannerViewProps) {
  return (
    <div
      ref={ref}
      className={cn(topBannerVariants({ severity }))}
      role={role}
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        {icon}
        <p className="min-w-0 text-sm wrap-break-word">
          <span className="font-bold">{title}</span> {children}
        </p>
      </div>
      {actions}
      {onClose && (
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0 self-end sm:self-auto"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <X size="base" color="default" />
        </Button>
      )}
    </div>
  );
}
