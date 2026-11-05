import { TriangleAlert } from "@langfuse/icons";

import { Alert } from "@/src/components/design-system/Alert/Alert";

export function ModelListingDeniedAlert() {
  return (
    <Alert variant="warning" icon={TriangleAlert}>
      <Alert.Title>Models can&apos;t be listed</Alert.Title>
      <Alert.Description>
        This key may call models but not list them, so only models you add
        manually are available. Grant <code>bedrock:ListFoundationModels</code>{" "}
        and <code>bedrock:ListInferenceProfiles</code> to list all models.
      </Alert.Description>
    </Alert>
  );
}
