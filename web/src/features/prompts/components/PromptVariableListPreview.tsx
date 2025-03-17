import { Badge } from "@/src/components/ui/badge";

export const PromptVariableListPreview = ({
  variables,
}: {
  variables: string[];
}) => {
  if (variables.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        The following variables are available:
      </p>
      <div className="flex min-h-6 flex-wrap gap-2">
        {variables.map((variable) => (
          <Badge key={variable} variant="outline">
            {variable}
          </Badge>
        ))}
      </div>
    </div>
  );
};
