import { Badge } from "@/src/components/ui/badge";

export const PromptDescription = ({
  currentExtractedVariables,
}: {
  currentExtractedVariables: string[];
}) => {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        You can use <code className="text-xs">{"{{variable}}"}</code> to insert
        variables into your prompt.
        <b className="font-semibold"> Note:</b> Variables must be alphabetical
        characters or underscores.
        {currentExtractedVariables.length > 0
          ? " The following variables are available:"
          : ""}
      </p>
      <div className="flex min-h-6 flex-wrap gap-2">
        {currentExtractedVariables.map((variable) => (
          <Badge key={variable} variant="outline">
            {variable}
          </Badge>
        ))}
      </div>
    </>
  );
};
