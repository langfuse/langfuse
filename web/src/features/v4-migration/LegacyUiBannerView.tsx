import Link from "next/link";
import { AlertCircle } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { V4_MIGRATION_DEADLINE } from "@/src/features/v4-migration/V4MigrationContent";

export type LegacyUiBannerViewProps = {
  /** When true, include the Cloud retirement date in the message. */
  hasDeadline: boolean;
  /** True while the enable-v4 mutation / session refresh is in flight. */
  isSwitching: boolean;
  onSwitchToLatestUi: () => void;
  onMigrationStatusClick?: () => void;
};

/**
 * Full-width top strip for users who opted back to the legacy (v3) UI.
 * Same amber tokens as the staff customer-data warning strip. Below `sm`
 * the actions drop to their own row (PaymentBanner pattern) so the message
 * keeps the full width. Not dismissible.
 */
export function LegacyUiBannerView({
  hasDeadline,
  isSwitching,
  onSwitchToLatestUi,
  onMigrationStatusClick,
}: LegacyUiBannerViewProps) {
  return (
    <div
      className="border-customer-data-banner-border bg-customer-data-banner text-customer-data-banner-foreground flex w-full flex-col gap-1 border-b px-4 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-1"
      role="status"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
        <AlertCircle size="sm" __rawClassName="mt-0.5 shrink-0 sm:mt-0" />
        <p className="min-w-0 text-sm wrap-break-word">
          <span className="font-bold">{"You're on the legacy UI."}</span>{" "}
          {hasDeadline
            ? `It will be retired on ${V4_MIGRATION_DEADLINE}.`
            : "It will be retired."}{" "}
          Switch to the latest UI (v4) anytime.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button
          size="sm"
          variant="secondary"
          loading={isSwitching}
          disabled={isSwitching}
          onClick={onSwitchToLatestUi}
        >
          Switch to latest UI
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href="/v4-migration" onClick={onMigrationStatusClick}>
            Migration status
          </Link>
        </Button>
      </div>
    </div>
  );
}
