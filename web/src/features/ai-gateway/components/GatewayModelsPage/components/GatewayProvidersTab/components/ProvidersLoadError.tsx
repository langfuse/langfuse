import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";

export type ProvidersLoadErrorProps = {
  onRetry: () => void;
};

export function ProvidersLoadError({ onRetry }: ProvidersLoadErrorProps) {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <Alert.Title>Providers could not be loaded</Alert.Title>
        <Alert.Description>
          Retry to see the gateway providers.
        </Alert.Description>
      </Alert>
      <div>
        <Button text="Retry" variant="secondary" onClick={onRetry} />
      </div>
    </div>
  );
}
