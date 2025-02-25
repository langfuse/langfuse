import { Badge } from "@/src/components/ui/badge";

export const PromptDescription = ({
  currentExtractedVariables,
}: {
  currentExtractedVariables: string[];
}) => {
  if (currentExtractedVariables.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        The following variables are available:
      </p>
      <div className="flex min-h-6 flex-wrap gap-2">
        {currentExtractedVariables.map((variable) => (
          <Badge key={variable} variant="outline">
            {variable}
          </Badge>
        ))}
      </div>
    </div>
  );
};
