import { GatewayCreateFirstKeyPlaceholder } from "@/src/features/ai-gateway/components/GatewayCreateFirstKeyPlaceholder/GatewayCreateFirstKeyPlaceholder";
import { GATEWAY_FIRST_REQUEST_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GATEWAY_PAGE_SLUGS } from "@/src/features/ai-gateway/constants/gatewayPageSlugs";
import { buildGatewayPagePath } from "@/src/features/ai-gateway/fns/gatewayUrls/buildGatewayPagePath";
import { useQueryOrganization } from "@/src/features/organizations/hooks";

/** The create-key dialog must live above this placeholder: it unmounts once the key exists. */
export function ConnectedGatewayCreateFirstKeyPlaceholder({
  organizationId,
  onCreateKey,
}: {
  organizationId: string;
  onCreateKey: () => void;
}) {
  const organization = useQueryOrganization();

  return (
    <GatewayCreateFirstKeyPlaceholder
      organizationName={organization?.name}
      onCreateKey={onCreateKey}
      usageInstructionsHref={GATEWAY_FIRST_REQUEST_DOCS_URL}
      modelsHref={buildGatewayPagePath(
        organizationId,
        GATEWAY_PAGE_SLUGS.models,
      )}
    />
  );
}
