import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";

const loadErrorCopy = {
  setup: {
    title: "Gateway setup could not be loaded",
    description: "Retry the request to continue setting up the gateway.",
  },
  providers: {
    title: "Connections could not be loaded",
    description: "Retry to see the gateway connections.",
  },
  connection: {
    title: "Connection could not be loaded",
    description: "Retry to manage model access for this connection.",
  },
  models: {
    title: "Connection models could not be loaded",
    description: "Retry to load the models of this connection.",
  },
} as const;

export type GatewayLoadErrorProps = {
  kind: keyof typeof loadErrorCopy;
  onRetry: () => void;
};

export function GatewayLoadError({ kind, onRetry }: GatewayLoadErrorProps) {
  const copy = loadErrorCopy[kind];

  return (
    <div className="flex flex-col items-start gap-4">
      <Alert variant="destructive">
        <Alert.Title>{copy.title}</Alert.Title>
        <Alert.Description>{copy.description}</Alert.Description>
      </Alert>
      <Button text="Retry" variant="secondary" onClick={onRetry} />
    </div>
  );
}
