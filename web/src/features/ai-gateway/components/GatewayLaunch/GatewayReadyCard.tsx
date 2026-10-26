import { Waypoints } from "@langfuse/icons";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/** Project-grid tile for gateway managers; the page shows it once set up. */
export function GatewayReadyCard({
  organizationId,
  activityLabel,
}: {
  organizationId: string;
  /** Trace activity of the gateway's ingestion project, as on project tiles. */
  activityLabel: string | null;
}) {
  const capture = usePostHogClientCapture();

  return (
    <Card className="group hover:bg-muted/50 relative transition-colors">
      <Link
        href={`/organization/${organizationId}/settings/ai-gateway-api-keys`}
        className="absolute inset-0"
        aria-label="Get an AI Gateway API key"
        onClick={() => capture("ai_gateway_launch:ready_tile_clicked")}
      />
      <CardHeader>
        <div className="flex items-center gap-2">
          <Waypoints size="base" color="default" aria-hidden="true" />
          <CardTitle className="truncate text-base" title="AI Gateway">
            AI Gateway
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="min-h-7 pb-3">
        <p className="text-muted-foreground text-xs">{activityLabel}</p>
      </CardContent>
    </Card>
  );
}
