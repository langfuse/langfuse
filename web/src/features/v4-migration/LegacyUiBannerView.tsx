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
 * Same placement and amber tokens as the staff customer-data warning strip;
 * layout is justify-between (copy left, actions right). Not dismissible.
 */
export function LegacyUiBannerView({
  hasDeadline,
  isSwitching,
  onSwitchToLatestUi,
  onMigrationStatusClick,
}: LegacyUiBannerViewProps) {
  return (
    <div
      className="border-customer-data-banner-border bg-customer-data-banner text-customer-data-banner-foreground flex w-full items-center justify-between gap-3 border-b px-4 py-1"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertCircle size="sm" __rawClassName="shrink-0" />
        <p className="min-w-0 text-sm wrap-break-word">
          <span className="font-bold">{"You're on the legacy UI."}</span>{" "}
          {hasDeadline
            ? `It will be retired on ${V4_MIGRATION_DEADLINE}.`
            : "It will be retired."}{" "}
          Switch to the latest UI (v4) anytime.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
