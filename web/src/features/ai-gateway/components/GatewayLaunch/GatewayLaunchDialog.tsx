import { ArrowUpRight, Check } from "@langfuse/icons";
import Link from "next/link";

import { Button } from "@/src/components/design-system/Button/Button";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { GatewayFanOutDiagram } from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/GatewayFanOutDiagram";
import diagramStyles from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/gatewayFanOutDiagram.module.css";
import { GATEWAY_OVERVIEW_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { type GatewayLaunchState } from "@/src/features/ai-gateway/hooks/useGatewayLaunchEligibility";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";

const copy = {
  admin: {
    title: "Introducing Langfuse AI Gateway",
    lead: "Route Claude Code, Codex, OpenCode, and your own apps through Langfuse. Each call becomes a full trace, along with who made it and what it cost.",
    points: [
      "Use one key across all providers",
      "Track spend by person, team, and key",
      "Approve and remove models for entire company",
      "Record full traces, not just token counts",
    ],
  },
  member: {
    title: "Get your own AI Gateway key",
    lead: "Access models across all connected providers with a single key you create yourself.",
    points: ["Create your own keys", "One key across all connected providers"],
  },
};

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
  const { title, lead, points } =
    copy[state === "get-key" ? "member" : "admin"];

  return (
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- design-system Dialog has no hero slot
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- design-system Dialog has no hero slot */}
      <DialogContent
        className="max-w-160 overflow-visible"
        closeOnInteractionOutside
        overlayMode="subtle"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:rounded-lg">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div
              className={cn(
                "flex h-72 min-h-48 items-center justify-center overflow-hidden border-b px-8 py-4",
                diagramStyles.panel,
              )}
            >
              <div className="w-full max-w-md">
                <GatewayFanOutDiagram sources={[]} />
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 px-8 pt-6 pb-8">
              {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- design-system Dialog has no hero slot */}
              <DialogTitle className="text-xl font-bold tracking-tight">
                {title}
              </DialogTitle>
              <p className="text-muted-foreground text-base leading-relaxed">
                {lead}
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
          </div>
          <div className="flex shrink-0 items-center justify-between border-t px-8 py-4">
            <Link
              href={GATEWAY_OVERVIEW_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                capture("ai_gateway_launch:dialog_learn_more_clicked", {
                  state,
                })
              }
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
            >
              Learn more
              <ArrowUpRight size="sm" aria-hidden="true" />
            </Link>
            {state === "setup" && (
              <span
                onClick={() =>
                  capture("ai_gateway_launch:dialog_setup_clicked")
                }
              >
                <Button
                  variant="primary"
                  text="Set up gateway"
                  href={buildGatewayPagePath(organizationId)}
                />
              </span>
            )}
            {state === "get-key" && (
              <span
                onClick={() =>
                  capture("ai_gateway_launch:dialog_get_key_clicked")
                }
              >
                <Button
                  variant="primary"
                  text="Get gateway key"
                  href={buildGatewayPagePath(organizationId, "api-keys")}
                />
              </span>
            )}
            {state === "ask-admin" && (
              <p role="status" className="text-muted-foreground text-sm">
                Ask your admin to set it up.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
