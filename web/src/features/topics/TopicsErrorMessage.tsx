import { Banner } from "@/src/components/design-system/Banner/Banner";

export function TopicsErrorMessage({ message }: TopicsErrorMessageProps) {
  return (
    <Banner variant="error">
      <p className="break-words">{message}</p>
    </Banner>
  );
}

type TopicsErrorMessageProps = {
  message: string;
};
