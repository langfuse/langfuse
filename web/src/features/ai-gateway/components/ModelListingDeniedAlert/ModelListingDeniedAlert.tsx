import { Banner } from "@/src/components/design-system/Banner/Banner";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export function ModelListingDeniedAlert({
  provider,
}: {
  provider: GatewayProvider;
}) {
  return (
    <Banner variant="warning" title="Models can't be listed">
      {listingDescription(provider)}
    </Banner>
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
