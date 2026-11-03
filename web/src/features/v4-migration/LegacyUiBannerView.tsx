import Link from "next/link";

import { Button } from "@/src/components/design-system/Button/Button";
import { V4_MIGRATION_DEADLINE } from "@/src/features/v4-migration/V4MigrationContent";

export type LegacyUiBannerViewProps = {
  /** When true, include the Cloud retirement date in the message. */
  hasDeadline: boolean;
  /** True while the enable-v4 mutation / session refresh is in flight. */
  isSwitching: boolean;
  onSwitchToLatestUi: () => void;
  /** Fires on the inline why-link click (analytics). */
  onMigrationStatusClick?: () => void;
};

/**
 * Full-width top strip for users who opted back to the legacy (v3) UI.
 * Blue preview-banner tokens. Copy + why-link on the left; enable CTA alone
 * on the right (DS Button outline/sm). Below `sm` the CTA drops under the
 * message. Not dismissible.
 */
export function LegacyUiBannerView({
  hasDeadline,
  isSwitching,
  onSwitchToLatestUi,
  onMigrationStatusClick,
}: LegacyUiBannerViewProps) {
  return (
    <div
      className="border-preview-banner-border bg-preview-banner text-preview-banner-foreground flex w-full flex-col gap-1 border-b px-4 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-1"
      role="status"
    >
      <p className="min-w-0 flex-1 text-sm wrap-break-word">
        <span className="font-bold">You are viewing legacy UI.</span>
        {hasDeadline
          ? ` It will be retired on ${V4_MIGRATION_DEADLINE}.`
          : null}{" "}
        <Link
          href="/v4-migration"
          onClick={onMigrationStatusClick}
          className="text-preview-banner-link hover:text-preview-banner-link-hover underline underline-offset-2"
        >
          Why do I need to switch?
        </Link>
      </p>
      <div className="flex shrink-0 self-end sm:self-auto">
        <Button
          size="sm"
          variant="outline"
          text="Switch to latest UI"
          loading={isSwitching}
          disabled={isSwitching}
          onClick={onSwitchToLatestUi}
        />
      </div>
    </div>
  );
}
