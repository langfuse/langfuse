import { Banner } from "@/src/components/design-system/Banner/Banner";

type NoMatchDisplayProps = {
  modelName: string;
};

export type { NoMatchDisplayProps };

export function NoMatchDisplay({ modelName }: NoMatchDisplayProps) {
  return (
    <Banner variant="error" title="No match found">
      <p>
        No model configuration matches &quot;{modelName}&quot; in this project.
      </p>
      <p className="mt-2">Suggestions:</p>
      <ul className="list-inside list-disc">
        <li>Check your model name spelling</li>
        <li>View existing models and their match patterns</li>
        <li>Create a new model definition</li>
      </ul>
    </Banner>
  );
}
