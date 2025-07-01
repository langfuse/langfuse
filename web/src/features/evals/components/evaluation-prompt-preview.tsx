import { ItemBadge } from "@/src/components/ItemBadge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useExtractVariables } from "@/src/features/evals/hooks/useExtractVariables";
import { type VariableMapping } from "@/src/features/evals/utils/evaluator-form-utils";
import { cn } from "@/src/utils/tailwind";
import { type RouterOutput } from "@/src/utils/types";
import { type EvalTemplate } from "@langfuse/shared";
import Link from "next/link";
import { Fragment, useMemo } from "react";

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

  // Format the value based on its type
  const renderValue = () => {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      // Check if the string is a JSON stringified string (starts and ends with quotes)
      if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
        try {
          // Attempt to parse it as JSON
          const parsed = JSON.parse(value);
          if (typeof parsed === "string") {
            // If it was a string, return the unquoted version
            return parsed;
          }
        } catch {
          // If parsing fails, it's not a JSON string literal, so return as-is
        }
      }
      // Display strings directly
      return value === "" ? "" : value;
    }

    if (typeof value === "object") {
      // Pretty print objects and arrays
      return JSON.stringify(value, null, 2);
    }

    // For other primitives (numbers, booleans)
    return String(value);
  };

  const displayValue = renderValue();
  const isLarge =
    typeof displayValue === "string" && displayValue.length > 1000;

  return (
    <span className={cn(color, "font-mono")}>
      {isLarge ? displayValue.substring(0, 1000) + "..." : displayValue}
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
      <div className="relative flex flex-col gap-2">
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

export const EvaluationPromptPreview = ({
  evalTemplate,
  trace,
  variableMapping,
  isLoading,
  showControls = true,
  className,
  controlButtons,
}: {
  evalTemplate: EvalTemplate;
  trace: RouterOutput["traces"]["byIdWithObservationsAndScores"];
  variableMapping: VariableMapping[];
  isLoading: boolean;
  showControls?: boolean;
  className?: string;
  controlButtons?: React.ReactNode;
}) => {
  const memoizedVariables = useMemo(
    () => variableMapping.map(({ templateVariable }) => templateVariable),
    [variableMapping],
  );

  const { extractedVariables, isExtracting } = useExtractVariables({
    variables: memoizedVariables,
    variableMapping,
    trace: trace,
    isLoading,
  });

  if (isExtracting) {
    return <Skeleton className="h-[200px] w-full" />;
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

  const content = (
    <div className="max-h-full min-h-0 flex-1 overflow-y-auto rounded-md border">
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <p>Loading variables...</p>
        </div>
      ) : (
        <ColoredPromptView fragments={getPromptFragments()} />
      )}
    </div>
  );

  if (!showControls) {
    return content;
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <span className="mb-1 flex flex-row items-center justify-between py-0 text-sm font-medium capitalize">
        <div className="flex flex-row items-center gap-2">
          Evaluation Prompt Preview
          <Link
            href={`/project/${trace.projectId}/traces/${trace.id}`}
            className="hover:cursor-pointer"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ItemBadge type="TRACE" showLabel />
          </Link>
        </div>
        {controlButtons}
      </span>
      {content}
    </div>
  );
};
