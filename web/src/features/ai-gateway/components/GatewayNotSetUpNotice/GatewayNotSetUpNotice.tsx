import { BookOpen } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_OVERVIEW_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";

export type GatewayNotSetUpNoticeProps = {
  organizationName: string | undefined;
  providers: GatewaySetupSwitchboardProps["providers"];
};

/** Shown to members who cannot set up the gateway while no admin has done so. */
export function GatewayNotSetUpNotice({
  organizationName,
  providers,
}: GatewayNotSetUpNoticeProps) {
  return (
    <GatewayPlaceholder.Frame
      title="AI Gateway isn’t set up yet"
      description={
        <>
          An admin or owner of {organizationName ?? "your organization"} needs
          to connect a provider before you can create a gateway key. Ask them to
          set it up.
        </>
      }
    >
      <Button
        variant="outline"
        text="Learn more about AI Gateway"
        icon={BookOpen}
        href={GATEWAY_OVERVIEW_DOCS_URL}
      />
      <GatewayPlaceholder.Diagram>
        <div className="mx-auto aspect-[440/200] w-full max-w-xl opacity-50 grayscale">
          <GatewaySetupSwitchboard
            providers={providers}
            sources={GATEWAY_TRAFFIC_SOURCES}
            idleLabel="Not set up"
          />
        </div>
      </GatewayPlaceholder.Diagram>
    </GatewayPlaceholder.Frame>
  );
}
