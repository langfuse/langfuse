import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useExtractVariables } from "@/src/ee/features/evals/hooks/useExtractVariables";
import { type VariableMapping } from "@/src/ee/features/evals/utils/evaluator-form-utils";
import { cn } from "@/src/utils/tailwind";
import { type EvalTemplate } from "@langfuse/shared";
import { Fragment } from "react";

const VARIABLE_COLORS = [
  "text-primary-accent",
  "text-dark-yellow",
  "text-dark-blue",
  "text-dark-green",
  "text-dark-red",
];

export const getVariableColor = (index: number) => {
  return VARIABLE_COLORS[index % VARIABLE_COLORS.length];
};

// Component for colored variable display
const ColoredVariable = ({
  value,
  index,
}: {
  value: unknown;
  index: number;
}) => {
  // Rotate through colors
  const color = getVariableColor(index);

  // Convert value to string safely
  const valueStr = typeof value === "string" ? value : JSON.stringify(value);

  // For very large strings, render a preview and truncate
  const isLarge = valueStr.length > 1000;

  return (
    <span className={cn(color, "font-mono")}>
      {isLarge
        ? valueStr.substring(0, 1000) + "..."
        : valueStr === ""
          ? `""`
          : valueStr}
    </span>
  );
};

// Custom wrapper for prompt that renders fragments with colored variables
const ColoredPromptView = ({
  fragments,
  className,
}: {
  fragments: Array<{
    type: "text" | "variable";
    content?: string;
    name?: string;
    value?: unknown;
    colorIndex?: number;
  }>;
  className?: string;
}) => {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative flex flex-col gap-2 rounded-md border">
        <pre className="flex-1 whitespace-pre-wrap break-words p-3 font-mono text-xs">
          {fragments.map((fragment, idx) => (
            <Fragment key={idx}>
              {fragment.type === "text" ? (
                fragment.content
              ) : (
                <ColoredVariable
                  value={fragment.value || ""}
                  index={fragment.colorIndex || 0}
                />
              )}
            </Fragment>
          ))}
        </pre>
      </div>
    </div>
  );
};

export const VariablePreviewDialog = ({
  evalTemplate,
  trace,
  variableMapping,
  isLoading,
}: {
  evalTemplate: EvalTemplate;
  trace?: Record<string, unknown>;
  variableMapping: VariableMapping[];
  isLoading: boolean;
}) => {
  const { extractedVariables, isExtracting } = useExtractVariables({
    variables: variableMapping.map(({ templateVariable }) => templateVariable),
    variableMapping: variableMapping,
    trace: trace,
    isLoading,
  });

  if (isExtracting) {
    return (
      <DialogContent className="max-w-4xl">
        <Skeleton className="h-[200px] w-full" />
      </DialogContent>
    );
  }

  // Helper function for prompt rendering
  const getPromptFragments = () => {
    if (!evalTemplate.prompt) {
      return [{ type: "text" as const, content: "" }];
    }

    const fragments = [];
    let lastIndex = 0;
    const regex = /{{([^{}]+)}}/g;
    let match;
    let colorIndex = 0;

    const promptText = evalTemplate.prompt;

    while ((match = regex.exec(promptText)) !== null) {
      // Add text before variable
      if (match.index > lastIndex) {
        fragments.push({
          type: "text" as const,
          content: promptText.substring(lastIndex, match.index),
        });
      }

      // Add variable
      const variableName = match[1];
      const variableValue =
        extractedVariables.find((v) => v.variable === variableName)?.value ||
        "";

      fragments.push({
        type: "variable" as const,
        name: variableName,
        value: variableValue,
        colorIndex: colorIndex++,
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < promptText.length) {
      fragments.push({
        type: "text" as const,
        content: promptText.substring(lastIndex),
      });
    }

    return fragments;
  };

  return (
    <DialogContent className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>Evaluation Prompt with Variables</DialogTitle>
        <span className="text-sm text-muted-foreground">
          Please note that this a mocked up preview only. If you are certain
          your configuration is correct, please feel free to proceed.
        </span>
      </DialogHeader>
      <div className="mt-4 max-h-[70vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <p>Loading variables...</p>
          </div>
        ) : (
          <ColoredPromptView fragments={getPromptFragments()} />
        )}
      </div>
    </DialogContent>
  );
};
