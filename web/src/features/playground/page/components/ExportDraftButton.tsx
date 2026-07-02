import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { usePlaygroundContext } from "@/src/features/playground/page/context";
import { type PlaygroundDraftSnapshot } from "@/src/features/playground/page/types";

interface ExportDraftButtonProps {
  className?: string;
}

export const ExportDraftButton: React.FC<ExportDraftButtonProps> = ({
  className,
}) => {
  const {
    modelParams,
    messages,
    promptVariables,
    tools,
    structuredOutputSchema,
  } = usePlaygroundContext();

  const handleExport = () => {
    const draft: PlaygroundDraftSnapshot = {
      schemaVersion: "langfuse-playground-draft/v1",
      model:
        modelParams.provider.value && modelParams.model.value
          ? `${modelParams.provider.value}:${modelParams.model.value}`
          : undefined,
      messages: messages.map(({ id, ...m }) => m),
      variables: promptVariables.reduce<Record<string, string>>((acc, v) => {
        if (v.name) acc[v.name] = v.value;
        return acc;
      }, {}),
      tools: tools.length > 0 ? tools : undefined,
      schema: structuredOutputSchema || undefined,
      modelParameters: Object.entries(modelParams).reduce<Record<string, any>>(
        (acc, [key, param]) => {
          if (
            !["provider", "model", "adapter", "maxTemperature"].includes(key) &&
            typeof param === "object" &&
            param !== null &&
            "enabled" in param &&
            param.enabled
          ) {
            acc[key] = param.value;
          }
          return acc;
        },
        {},
      ),
    };

    const blob = new Blob([JSON.stringify(draft, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", url);
    const dateStr = new Date().toISOString().slice(0, 10);
    const modelStr = modelParams.model.value
      ? `-${modelParams.model.value}`
      : "";
    downloadAnchor.setAttribute(
      "download",
      `playground-draft${modelStr}-${dateStr}.json`,
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={handleExport}
          className={className ?? "h-7 w-7"}
          title="Export draft"
        >
          <Download size={14} />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">Export draft</TooltipContent>
    </Tooltip>
  );
};
