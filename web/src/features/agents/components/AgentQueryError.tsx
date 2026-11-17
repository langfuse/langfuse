import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";

export function AgentQueryError({ retry }: { retry: () => void }) {
  return (
    <div className="p-4">
      <Alert variant="destructive">
        <Alert.Title>Agent data could not be loaded</Alert.Title>
        <Alert.Description>
          <p>Try again or select a smaller time range.</p>
          <Button text="Retry" variant="secondary" onClick={retry} />
        </Alert.Description>
      </Alert>
    </div>
  );
}
