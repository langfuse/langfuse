import { type Ref } from "react";
import { AlertCircle, CreditCard } from "@langfuse/icons";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import {
  TopBannerView,
  type TopBannerSeverity,
} from "@/src/features/top-banner/TopBannerView";

export type PaymentBannerViewProps = {
  severity?: TopBannerSeverity | null;
  /** Organization the failing subscription belongs to. */
  organizationName: string;
  /** Billing settings page for that organization. */
  billingSettingsHref: string;
  ref?: Ref<HTMLDivElement>;
};

/** Full-width strip warning that a subscription payment could not be collected. */
export function PaymentBannerView({
  organizationName,
  billingSettingsHref,
  severity,
  ref,
}: PaymentBannerViewProps) {
  return (
    <TopBannerView
      ref={ref}
      severity={severity}
      // mt-0.5 optically centers the 16px icon on the first 20px text line
      icon={<AlertCircle size="base" __rawClassName="mt-0.5 sm:mt-0" />}
      title="Billing Issue:"
      actions={
        <Button
          size="sm"
          variant="ghost"
          asChild
          className="shrink-0 self-end sm:self-auto"
        >
          <Link href={billingSettingsHref}>
            <CreditCard size="base" color="default" __rawClassName="mr-2" />
            Update Payment
          </Link>
        </Button>
      }
    >
      {`We have problems collecting subscription payment for your organization '${organizationName}'. Please update your payment information to continue using Langfuse.`}
    </TopBannerView>
  );
}
