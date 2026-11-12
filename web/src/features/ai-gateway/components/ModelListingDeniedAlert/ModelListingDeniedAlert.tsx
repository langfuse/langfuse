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
      <Alert.Description>{listingDescription(provider)}</Alert.Description>
    </Alert>
  );
}

function listingDescription(provider: GatewayProvider) {
  if (provider === "AZURE") {
    return (
      <>
        Deployments are listed per Foundry project. Check that the connection
        names the right project; without one, only a default project is listed.
        The key may also not be allowed to list deployments. Deployments can
        still be added as custom models by their deployment name.
      </>
    );
  }
  return (
    <>
      This key may call models but can&apos;t list all of them, so some models
      may be missing here. {listingHint(provider)}
    </>
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
