import { ArrowLeft } from "lucide-react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";

export type ConnectionModelsLoadErrorProps = {
  organizationId: string;
  retry: () => void;
};

export function ConnectionModelsLoadError({
  organizationId,
  retry,
}: ConnectionModelsLoadErrorProps) {
  return (
    <div className="flex flex-col gap-4">
      <TextLink
        path={`/organization/${encodeURIComponent(organizationId)}/settings/ai-gateway-providers`}
        value="Provider credentials"
        icon={ArrowLeft}
      />
      <Alert variant="destructive">
        <Alert.Title>Provider models could not be loaded</Alert.Title>
        <Alert.Description>
          Retry to manage model access for this credential.
        </Alert.Description>
      </Alert>
      <div>
        <Button text="Retry" variant="secondary" onClick={retry} />
      </div>
    </div>
  );
}
