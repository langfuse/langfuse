import { ArrowRight, X } from "@langfuse/icons";
import { useState } from "react";

import { DismissController } from "@/src/components/DismissController";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/ui/button";
import styles from "@/src/features/ai-gateway/components/GatewayLaunch/gatewayLaunch.module.css";
import { GatewayLaunchDialog } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewayLaunchDialog";
import { GatewayReceipt } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewayReceipt";
import {
  type GatewayLaunchState,
  type GatewayLaunchTarget,
} from "@/src/features/ai-gateway/hooks/useGatewayLaunchEligibility";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";

function ctaLabel(state: GatewayLaunchState) {
  if (state === "get-key") return "Get gateway key";
  if (state === "ask-admin") return "Learn more";
  return "Set up";
}

/** Organizations-page banner; the page renders it only when there is a target. */
export function GatewayLaunchBanner({
  target,
  userId,
}: {
  target: GatewayLaunchTarget;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const { state, setupOptions } = target;
  const { organizationId } = target;
  const captureCta = () =>
    capture("ai_gateway_launch:banner_cta_clicked", {
      state,
      orgCount: setupOptions.length,
    });
  const arrow = (
    <ArrowRight size="base" __rawClassName="ml-1.5" aria-hidden="true" />
  );

  return (
    <>
      <DismissController
        id={`ai-gateway-launch:v2:${userId}:${state}:${target.organizationId}`}
        family="callouts"
      >
        {({ onDismiss }) => (
          <div
            className={cn(
              "bg-surface-section relative mt-2 mb-4 flex h-24 items-center gap-6 overflow-hidden rounded-lg pr-12 pl-6",
              styles.dotGrid,
              styles.bannerDots,
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold">AI Gateway</span>
                <Badge text="Beta" color="blue" size="sm" font="mono" />
              </div>
              <p
                className="text-muted-foreground truncate text-base"
                title="One gateway key for full visibility into what your agents cost."
              >
                One gateway key for full visibility into what your agents cost.
              </p>
            </div>
            <div className="relative mr-12 hidden h-full w-72 shrink-0 xl:block">
              <div className="absolute inset-x-0 -top-2">
                <GatewayReceipt variant="banner" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                onClick={() => {
                  captureCta();
                  setOpen(true);
                }}
              >
                {ctaLabel(state)}
                {arrow}
              </Button>
            </div>
            <span className="absolute top-2 right-2">
              <IconButton
                icon={X}
                label="Dismiss"
                size="sm"
                onClick={() => {
                  capture("ai_gateway_launch:banner_dismissed", { state });
                  onDismiss();
                }}
              />
            </span>
          </div>
        )}
      </DismissController>
      <GatewayLaunchDialog
        key={organizationId}
        organizationId={organizationId}
        state={state}
        setupOptions={setupOptions}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
