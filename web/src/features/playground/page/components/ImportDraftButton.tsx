import React, { useRef } from "react";
import { Upload } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { usePlaygroundContext } from "@/src/features/playground/page/context";
import {
  type PlaygroundDraftSnapshot,
  type PlaygroundSchema,
} from "@/src/features/playground/page/types";
import { ChatMessageRole } from "@langfuse/shared";

interface ImportDraftButtonProps {
  className?: string;
}

export const ImportDraftButton: React.FC<ImportDraftButtonProps> = ({
  className,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    setMessages,
    setPromptVariables,
    setTools,
    setStructuredOutputSchema,
    updateModelParamValue,
    setModelParamEnabled,
  } = usePlaygroundContext();

  const mapRoleToType = (role: string, toolCalls?: any[]): string => {
    switch (role) {
      case "system":
        return "system";
      case "developer":
        return "developer";
      case "user":
        return "user";
      case "assistant":
        return toolCalls && toolCalls.length > 0
          ? "assistant-tool-call"
          : "assistant-text";
      case "tool":
        return "tool-result";
      case "model":
        return "model-text";
      default:
        return "user";
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== "string") {
          throw new Error("Could not read file as string");
        }

        const parsed = JSON.parse(text) as PlaygroundDraftSnapshot;

        if (!parsed || typeof parsed !== "object") {
          throw new Error("Invalid JSON structure");
        }

        // Schema Version validation
        if (parsed.schemaVersion !== "langfuse-playground-draft/v1") {
          toast.warning(
            "Schema version mismatch or missing, but trying to parse layout anyway.",
          );
        }

        // 1. Model selection: "provider:model-name"
        if (typeof parsed.model === "string" && parsed.model.includes(":")) {
          const colonIndex = parsed.model.indexOf(":");
          const provider = parsed.model.substring(0, colonIndex).trim();
          const model = parsed.model.substring(colonIndex + 1).trim();
          if (provider) {
            updateModelParamValue("provider", provider);
          }
          if (model) {
            updateModelParamValue("model", model);
          }
        }

        // 2. Model Parameters
        if (parsed.modelParameters && typeof parsed.modelParameters === "object") {
          Object.entries(parsed.modelParameters).forEach(([key, val]) => {
            updateModelParamValue(key as any, val);
            if (setModelParamEnabled) {
              setModelParamEnabled(key as any, true);
            }
          });
        }

        // 3. Messages
        if (Array.isArray(parsed.messages)) {
          const mappedMessages = parsed.messages.map((m: any) => {
            const role = m.role || ChatMessageRole.User;
            const content = m.content ?? "";
            const type = m.type || mapRoleToType(role, m.toolCalls);
            return {
              ...m,
              id: m.id || uuidv4(),
              role,
              content,
              type,
            };
          });
          setMessages(mappedMessages);
        }

        // 4. Variables
        if (parsed.variables && typeof parsed.variables === "object") {
          const importedVars = Object.entries(parsed.variables).map(
            ([name, value]) => ({
              name,
              value: String(value),
              isUsed: true,
            }),
          );
          setPromptVariables(importedVars);
        }

        // 5. Tools
        if (Array.isArray(parsed.tools)) {
          const mappedTools = parsed.tools.map((t: any) => ({
            ...t,
            id: t.id || uuidv4(),
          }));
          setTools(mappedTools);
        }

        // 6. Schema / Structured Output Schema
        const schemaVal =
          parsed.schema !== undefined ? parsed.schema : parsed.structuredOutputSchema;
        if (schemaVal && typeof schemaVal === "object") {
          if ("schema" in schemaVal) {
            setStructuredOutputSchema(schemaVal as PlaygroundSchema);
          } else {
            setStructuredOutputSchema({
              id: uuidv4(),
              name: "Imported Schema",
              description: "Imported via Playground snapshot",
              schema: schemaVal,
            });
          }
        } else if (schemaVal === null) {
          setStructuredOutputSchema(null);
        }

        toast.success("Playground draft imported successfully!");
      } catch (err) {
        console.error("Failed to parse playground draft JSON:", err);
        toast.error("Failed to parse draft JSON file.");
      } finally {
        // Reset file input value to allow uploading same file again if needed
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={handleImportClick}
            className={className ?? "h-7 w-7"}
            title="Import draft"
          >
            <Upload size={14} />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Import draft</TooltipContent>
      </Tooltip>
    </>
  );
};
