import Link from "next/link";
import { ArrowUpCircle } from "lucide-react";
import { Callout } from "@/src/components/ui/callout";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  useShowV4UpgradeHint,
  V4_UPGRADE_GUIDE_URL,
  V4_UPGRADE_HINT_DESCRIPTION,
  V4_UPGRADE_HINT_TITLE,
} from "@/src/features/v4-upgrade/useV4UpgradeHint";

/** Shorter than the Callout default (30d) so the hint resurfaces while the deployment stays on v3. */
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Dismissible banner on the organization overview that points self-hosted
 * Langfuse v3 deployments to the v4 upgrade guide.
 */
export function V4UpgradeBanner() {
  const capture = usePostHogClientCapture();
  const showHint = useShowV4UpgradeHint();
  const handleDismiss = () => {
    capture("v4_upgrade_hint:dismiss", { surface: "banner" });
  };
  const handleUpgradeGuideClick = () => {
    capture("v4_upgrade_hint:click_upgrade_guide", { surface: "banner" });
  };
  const renderUpgradeGuideAction = () => (
    <Button asChild size="sm" variant="secondary">
      <Link
        href={V4_UPGRADE_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleUpgradeGuideClick}
      >
        Upgrade guide
      </Link>
    </Button>
  );

  if (!showHint) return null;

  return (
    <Callout
      className="mb-4"
      id="v4-upgrade-banner:v1"
      ttlMs={DISMISS_TTL_MS}
      variant="warning"
      align="middle"
      onDismiss={handleDismiss}
      actions={renderUpgradeGuideAction}
    >
      <div className="flex items-center gap-2">
        <ArrowUpCircle className="h-4 w-4 shrink-0" />
        <span>
          <span className="font-bold">{V4_UPGRADE_HINT_TITLE}.</span>{" "}
          {V4_UPGRADE_HINT_DESCRIPTION}
        </span>
      </div>
    </Callout>
  );
}
