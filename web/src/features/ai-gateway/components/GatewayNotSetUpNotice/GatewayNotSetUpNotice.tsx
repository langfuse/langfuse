import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayTrafficDiagram } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayTrafficDiagram";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_OVERVIEW_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";

export type GatewayNotSetUpNoticeProps = {
  organizationName: string | undefined;
};

/** Shown to members who cannot set up the gateway while no admin has done so. */
export function GatewayNotSetUpNotice({
  organizationName,
}: GatewayNotSetUpNoticeProps) {
  return (
    <GatewayPlaceholder.Frame
      title="AI Gateway isn’t set up yet"
      description={
        <>
          An admin or owner of{" "}
          <span className="ph-no-capture">
            {organizationName ?? "your organization"}
          </span>{" "}
          needs to connect a provider before you can create a gateway key. Ask
          them to set it up.
        </>
      }
    >
      <Button
        variant="outline"
        text="Learn more about AI Gateway"
        href={GATEWAY_OVERVIEW_DOCS_URL}
      />
      <GatewayTrafficDiagram />
    </GatewayPlaceholder.Frame>
  );
}
