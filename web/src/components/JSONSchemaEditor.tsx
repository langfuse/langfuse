import React from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { CodeMirrorEditor } from "@/src/components/editor";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";

type JSONSchemaEditorMode = "json"; // Future: "json" | "builder"

type JSONSchemaEditorProps = {
  /**
   * The JSON Schema as a string
   */
  value: string;
  /**
   * Callback when schema changes
   */
  onChange: (value: string) => void;
  /**
   * Editor mode - currently only "json", future: visual "builder"
   */
  mode?: JSONSchemaEditorMode;
  /**
   * Maximum height CSS class
   */
  className?: string;
  /**
   * Whether the editor is disabled
   */
  disabled?: boolean;
  /**
   * Show help text with link to JSON Schema docs
   */
  showHelp?: boolean;
};

/**
 * Reusable JSON Schema editor component
 * Currently supports JSON text editing mode
 * Designed to be extended with visual schema builder in the future
 */
export const JSONSchemaEditor: React.FC<JSONSchemaEditorProps> = ({
  value,
  onChange,
  mode = "json",
  className = "max-h-[25vh]",
  disabled = false,
  showHelp = true,
}) => {
  const prettifyJson = () => {
    try {
      const parsedJson = JSON.parse(value);
      const prettified = JSON.stringify(parsedJson, null, 2);
      onChange(prettified);
    } catch (error) {
      showErrorToast(
        "Failed to prettify JSON",
        "Please verify your input is valid JSON",
        "WARNING",
      );
    }
  };

  // Future: Add builder mode UI here
  if (mode === "json") {
    return (
      <div className="flex flex-col gap-2">
        {showHelp && (
          <p className="text-sm text-muted-foreground">
            Define the structure using JSON Schema format.{" "}
            <a
              href="https://json-schema.org/learn/miscellaneous-examples"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center underline hover:text-foreground"
            >
              See JSON Schema examples
              <ArrowUpRight className="ml-0.5 h-3 w-3" />
            </a>
          </p>
        )}
        <div className="relative flex flex-col gap-1">
          <CodeMirrorEditor
            value={value}
            onChange={onChange}
            mode="json"
            minHeight={100}
            className={className}
            editable={!disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={prettifyJson}
            disabled={disabled}
            className="absolute right-3 top-3 text-xs"
          >
            Prettify
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Must be a valid JSON Schema object
        </p>
      </div>
    );
  }

  // Future mode implementations go here
  return null;
};
