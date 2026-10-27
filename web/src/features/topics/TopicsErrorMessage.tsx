import { Alert } from "@/src/components/design-system/Alert/Alert";

export function TopicsErrorMessage({ message }: TopicsErrorMessageProps) {
  return (
    <Alert variant="destructive">
      <Alert.Description>
        <p className="break-words">{message}</p>
      </Alert.Description>
    </Alert>
  );
}

type TopicsErrorMessageProps = {
  message: string;
};
