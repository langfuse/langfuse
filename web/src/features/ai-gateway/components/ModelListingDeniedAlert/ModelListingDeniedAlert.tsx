import { TriangleAlert } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export function ModelListingDeniedAlert({
  provider,
}: {
  provider: GatewayProvider;
}) {
  return (
    <Alert variant="warning" icon={TriangleAlert}>
      <Alert.Title>Models can&apos;t be listed</Alert.Title>
      <Alert.Description>
        This key may call models but can&apos;t list all of them, so some models
        may be missing here. {listingHint(provider)}
      </Alert.Description>
    </Alert>
  );
}

function listingHint(provider: GatewayProvider) {
  if (provider === "BEDROCK") {
    return (
      <>
        Grant <code>bedrock:ListFoundationModels</code> and{" "}
        <code>bedrock:ListInferenceProfiles</code> to list all models.
      </>
    );
  }
  if (provider === "XAI") {
    return (
      <>Allow the models endpoint in the key&apos;s ACLs in the xAI Console.</>
    );
  }
  return null;
}
