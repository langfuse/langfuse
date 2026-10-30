import { ArrowUpRight, Check } from "@langfuse/icons";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button as MenuTriggerButton } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { PopoverLayerProvider } from "@/src/context/LayerContext/PopoverLayerProvider";
import {
  type GatewayLaunchState,
  type GatewayLaunchTarget,
} from "@/src/features/ai-gateway/hooks/useGatewayLaunchEligibility";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { GatewayHero } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewayHero";

const copy = {
  admin: {
    title: "Introducing Langfuse AI Gateway",
    lead: "Point Claude Code, Codex or your SDK at one Langfuse endpoint. See what every member spends.",
    points: [
      "A key for every member, cost attributed per person",
      "Turn models on or off for your org",
      "Every call traced in Langfuse",
    ],
  },
  member: {
    title: "Get your own AI Gateway key",
    lead: "Access Anthropic and OpenAI models with a single key you create yourself.",
    points: ["Create your own keys", "One key for Anthropic and OpenAI models"],
  },
};

export function GatewayLaunchDialog({
  organizationId,
  state,
  setupOptions,
  open,
  onOpenChange,
}: {
  organizationId: string;
  state: GatewayLaunchState;
  setupOptions: GatewayLaunchTarget["setupOptions"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const capture = usePostHogClientCapture();
  const router = useRouter();
  // Menus inside the dialog portal here, so the modal does not hide them from assistive tech.
  const [popoverContainer, setPopoverContainer] =
    useState<HTMLDivElement | null>(null);
  const { title, lead, points } =
    copy[state === "get-key" ? "member" : "admin"];
  const setupHref = (orgId: string) =>
    `/organization/${orgId}/settings/ai-gateway`;

  return (
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- design-system Dialog has no hero slot
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* eslint-disable-next-line @typescript-eslint/no-deprecated -- design-system Dialog has no hero slot */}
      <DialogContent
        className="max-w-160 overflow-visible"
        closeOnInteractionOutside
        overlayMode="subtle"
      >
        <PopoverLayerProvider container={popoverContainer}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:rounded-lg">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <GatewayHero />
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
                href="https://langfuse.com/docs/ai-gateway"
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
              {state === "setup" && setupOptions.length > 1 && (
                <DropdownMenu
                  title="Select an organization"
                  items={setupOptions.map((option) => ({
                    type: "item",
                    id: option.organizationId,
                    title: option.organizationName,
                    onClick: () => {
                      capture("ai_gateway_launch:dialog_setup_clicked");
                      router.push(setupHref(option.organizationId));
                    },
                  }))}
                >
                  {({ getTriggerProps }) => (
                    /** The design-system Button does not forward floating-ui trigger handlers. */
                    <MenuTriggerButton
                      className="gap-1.5"
                      {...getTriggerProps()}
                    >
                      Set up gateway
                      <DropdownIndicator nudge />
                    </MenuTriggerButton>
                  )}
                </DropdownMenu>
              )}
              {state === "setup" && setupOptions.length <= 1 && (
                <span
                  onClick={() =>
                    capture("ai_gateway_launch:dialog_setup_clicked")
                  }
                >
                  <Button
                    variant="primary"
                    text="Set up gateway"
                    href={setupHref(organizationId)}
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
                    text="Get API key"
                    href={`/organization/${organizationId}/settings/ai-gateway-api-keys`}
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
        </PopoverLayerProvider>
        <div
          className="isolate"
          data-layer="popover"
          ref={setPopoverContainer}
        />
      </DialogContent>
    </Dialog>
  );
}
