import { CalendarClock, Clock, Unplug } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { TopBannerActions } from "@/src/features/top-banner/TopBannerActions";
import { TopBannerView } from "@/src/features/top-banner/TopBannerView";
import type {
  V4MigrationTopBannerContent,
  V4MigrationTopBannerPhase,
} from "@/src/features/v4-migration/topBannerContent";

const PHASE_ICON: Record<V4MigrationTopBannerPhase, typeof Clock> = {
  amber: CalendarClock,
  brownout_day: Clock,
  brownout_active: Clock,
  cut: Unplug,
};

export type V4MigrationTopBannerViewProps = {
  phase: V4MigrationTopBannerPhase;
  content: V4MigrationTopBannerContent;
  /** Opens the migration panel; rendered only with a primary CTA label. */
  onPrimaryClick: () => void;
  onSecondaryClick: () => void;
  /** Set only while the banner may be closed. */
  onClose?: () => void;
};

/** Legacy API shutdown strip for the top-banner stack; all copy comes from `content`. */
export function V4MigrationTopBannerView({
  phase,
  content,
  onPrimaryClick,
  onSecondaryClick,
  onClose,
}: V4MigrationTopBannerViewProps) {
  const Icon = PHASE_ICON[phase];

  return (
    <TopBannerView
      severity={content.severity}
      role={phase === "amber" ? "status" : "alert"}
      icon={<Icon size="base" __rawClassName="mt-0.5 sm:mt-0" />}
      title={content.title}
      actions={
        <TopBannerActions>
          {content.primaryCtaLabel && (
            <Button size="sm" variant="secondary" onClick={onPrimaryClick}>
              {content.primaryCtaLabel}
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <a
              href={content.secondaryLink.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onSecondaryClick}
            >
              {content.secondaryLink.label}
            </a>
          </Button>
        </TopBannerActions>
      }
      onClose={onClose}
    >
      {content.body}
    </TopBannerView>
  );
}
