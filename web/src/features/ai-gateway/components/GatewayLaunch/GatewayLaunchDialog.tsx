import { ArrowUpRight, Check } from "@langfuse/icons";
import Link from "next/link";

import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { type GatewayLaunchState } from "@/src/features/ai-gateway/hooks/useGatewayLaunchEligibility";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { GatewayHero } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewayHero";

const points = [
  "A key for every member, cost attributed per person",
  "Turn models on or off for your org",
  "Every call traced in Langfuse",
];

export function GatewayLaunchDialog({
  organizationId,
  state,
  open,
  onOpenChange,
}: {
  organizationId: string;
  state: GatewayLaunchState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const capture = usePostHogClientCapture();

  return (
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- design-system Dialog has no hero slot
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- design-system Dialog has no hero slot */}
      <DialogContent
        className="max-w-160"
        closeOnInteractionOutside
        overlayMode="subtle"
      >
        <GatewayHero />
        <div className="flex flex-col gap-2 px-8 pt-6 pb-8">
          {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- design-system Dialog has no hero slot */}
          <DialogTitle className="text-xl font-bold tracking-tight">
            Introducing Langfuse AI Gateway
          </DialogTitle>
          <p className="text-muted-foreground text-base leading-relaxed">
            Point Claude Code, Codex or your SDK at one Langfuse endpoint. See
            what every member spends.
          </p>
          <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-sm">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span className="text-dark-green flex">
                  <Check size="sm" color="inherit" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between border-t px-8 py-4">
          <Link
            href="https://langfuse.com/docs/ai-gateway"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              capture("ai_gateway_launch:dialog_learn_more_clicked", { state })
            }
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            Learn more
            <ArrowUpRight size="sm" aria-hidden="true" />
          </Link>
          {state === "setup" && (
            <span
              onClick={() => capture("ai_gateway_launch:dialog_setup_clicked")}
            >
              <Button
                variant="primary"
                text="Set up gateway"
                href={`/organization/${organizationId}/settings/ai-gateway`}
              />
            </span>
          )}
          {state === "ask-admin" && (
            <p role="status" className="text-muted-foreground text-sm">
              Ask your organization admin to set up the AI Gateway.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
