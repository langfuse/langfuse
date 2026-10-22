import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";

const loadErrorCopy = {
  connection: {
    title: "Provider credential could not be loaded",
    description: "Retry to manage model access for this credential.",
  },
  models: {
    title: "Provider models could not be loaded",
    description: "Retry to manage model access for this credential.",
  },
} as const;

export type ConnectionModelsLoadErrorProps = {
  kind: keyof typeof loadErrorCopy;
  retry: () => void;
};

export function ConnectionModelsLoadError({
  kind,
  retry,
}: ConnectionModelsLoadErrorProps) {
  const copy = loadErrorCopy[kind];

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <Alert.Title>{copy.title}</Alert.Title>
        <Alert.Description>{copy.description}</Alert.Description>
      </Alert>
      <div>
        <Button text="Retry" variant="secondary" onClick={retry} />
      </div>
    </div>
  );
}
