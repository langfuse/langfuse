import { ArrowRight } from "@langfuse/icons";
import Link from "next/link";

import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { GatewayHero } from "@/src/features/ai-gateway/components/GatewayLaunch/GatewayHero";

/** Home for people invited only to use the gateway: one action, nothing else. */
export function GatewayOnlyLanding({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const capture = usePostHogClientCapture();

  return (
    <div className="mx-auto mt-12 w-full max-w-160 overflow-hidden rounded-lg border">
      <GatewayHero />
      <div className="flex flex-col items-start gap-2 px-8 pt-6 pb-8">
        <h2 className="text-xl font-bold tracking-tight">
          Get your AI Gateway API key
        </h2>
        <p className="text-muted-foreground text-base leading-relaxed">
          {organizationName} uses the Langfuse AI Gateway. Create a key, then
          paste it into Claude Code, Codex or OpenCode.
        </p>
        <Button asChild className="mt-4">
          <Link
            href={`/organization/${organizationId}/settings/ai-gateway-api-keys`}
            onClick={() =>
              capture("ai_gateway_launch:gateway_only_key_clicked")
            }
          >
            Get API key
            <ArrowRight
              size="base"
              __rawClassName="ml-1.5"
              aria-hidden="true"
            />
          </Link>
        </Button>
      </div>
    </div>
  );
}
