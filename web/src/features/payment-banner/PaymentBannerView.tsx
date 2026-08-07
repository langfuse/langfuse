import { type Ref } from "react";
import { AlertCircle, CreditCard } from "lucide-react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

const paymentBannerVariants = cva(
  "fixed top-0 z-51 flex w-full items-center gap-3 px-4 py-1",
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
 * squeezing a title column (LFE-14490).
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
      <AlertCircle className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm break-words">
        <span className="font-bold">Billing Issue:</span>{" "}
        {`We have problems collecting subscription payment for your organization '${organizationName}'. Please update your payment information to continue using Langfuse.`}
      </p>
      <Button size="sm" variant="ghost" asChild className="shrink-0">
        <Link href={billingSettingsHref}>
          <CreditCard className="mr-2 h-4 w-4" />
          Update Payment
        </Link>
      </Button>
    </div>
  );
}
