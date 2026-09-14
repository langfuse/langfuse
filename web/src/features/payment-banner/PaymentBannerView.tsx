import { type Ref } from "react";
import { AlertCircle, CreditCard } from "lucide-react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

const paymentBannerVariants = cva(
  "fixed top-0 z-51 flex w-full flex-col gap-1 px-4 py-1.5 sm:flex-row sm:items-center sm:gap-3 sm:py-1",
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

export type PaymentBannerViewProps = VariantProps<
  typeof paymentBannerVariants
> & {
  /** Organization the failing subscription belongs to. */
  organizationName: string;
  /** Billing settings page for that organization. */
  billingSettingsHref: string;
  ref?: Ref<HTMLDivElement>;
};

/**
 * Full-width strip warning that a subscription payment could not be collected.
 * Icon, then the message as one paragraph flow with the title as a bold inline
 * span, then the action — so narrow widths reflow the whole sentence instead of
 * squeezing a title column (LFE-14490). Below `sm` the action drops to its own
 * row so the message keeps the full width instead of wrapping beside it.
 */
export function PaymentBannerView({
  organizationName,
  billingSettingsHref,
  severity,
  ref,
}: PaymentBannerViewProps) {
  return (
    <div
      ref={ref}
      className={cn(paymentBannerVariants({ severity }))}
      role="alert"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        {/* mt-0.5 optically centers the 16px icon on the first 20px text line */}
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
        <p className="min-w-0 text-sm wrap-break-word">
          <span className="font-bold">Billing Issue:</span>{" "}
          {`We have problems collecting subscription payment for your organization '${organizationName}'. Please update your payment information to continue using Langfuse.`}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        asChild
        className="shrink-0 self-end sm:self-auto"
      >
        <Link href={billingSettingsHref}>
          <CreditCard className="mr-2 h-4 w-4" />
          Update Payment
        </Link>
      </Button>
    </div>
  );
}
