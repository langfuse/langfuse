import { ArrowRight, X } from "@langfuse/icons";
import Link from "next/link";
import { useState } from "react";

import { DismissController } from "@/src/components/DismissController";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
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

function ctaLabel(
  state: GatewayLaunchState,
  setupOptions: GatewayLaunchTarget["setupOptions"],
) {
  if (state === "get-key") return "Get API key";
  if (state === "ask-admin") return "Learn more";
  if (setupOptions.length > 1) return "Set up gateway";
  return `Set up gateway for ${setupOptions[0]?.organizationName ?? "your org"}`;
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
  const [pickedOrgId, setPickedOrgId] = useState<string>();
  const capture = usePostHogClientCapture();
  const { state, setupOptions } = target;
  const organizationId =
    setupOptions.find((option) => option.organizationId === pickedOrgId)
      ?.organizationId ?? target.organizationId;
  const hasOrgPicker = state === "setup" && setupOptions.length > 1;
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
                <Badge text="New" color="yellow" size="sm" font="mono" />
              </div>
              <p
                className="text-muted-foreground truncate text-sm"
                title="One gateway key for full visibility into what your agents cost."
              >
                One gateway key for full visibility into what your agents cost.
              </p>
            </div>
            <div className="relative hidden h-full w-72 shrink-0 xl:block">
              <div className="absolute inset-x-0 -top-2">
                <GatewayReceipt variant="banner" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {hasOrgPicker && (
                <div className="w-48">
                  <SelectInput
                    aria-label="Organization"
                    placeholder="Select organization"
                    value={organizationId}
                    onValueChange={setPickedOrgId}
                    options={setupOptions.map((option) => ({
                      value: option.organizationId,
                      label: option.organizationName,
                    }))}
                  />
                </div>
              )}
              {state === "get-key" ? (
                <Button asChild>
                  <Link
                    href={`/organization/${organizationId}/settings/ai-gateway-api-keys`}
                    onClick={captureCta}
                  >
                    {ctaLabel(state, setupOptions)}
                    {arrow}
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    captureCta();
                    setOpen(true);
                  }}
                >
                  {ctaLabel(state, setupOptions)}
                  {arrow}
                </Button>
              )}
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
        organizationId={organizationId}
        state={state}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
