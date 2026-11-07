import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";

export type GatewayConfigLoadErrorProps = {
  onRetry: () => void;
};

export function GatewayConfigLoadError({
  onRetry,
}: GatewayConfigLoadErrorProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert variant="destructive">
        <Alert.Title>Gateway setup could not be loaded</Alert.Title>
        <Alert.Description>
          Retry the request to continue setting up the gateway.
        </Alert.Description>
      </Alert>
      <Button text="Retry" variant="secondary" onClick={onRetry} />
    </div>
  );
}
