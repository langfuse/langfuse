import { CheckCircle2, Circle, TrashIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type PromptVariable, type PromptVariableType } from "@langfuse/shared";
import { CodeMirrorEditor } from "@/src/components/editor";

import { usePlaygroundContext } from "../context";
import { useNamingConflicts } from "../hooks/useNamingConflicts";

export const PromptVariableComponent: React.FC<{
  promptVariable: PromptVariable;
}> = ({ promptVariable }) => {
  const {
    updatePromptVariableValue,
    updatePromptVariableType,
    deletePromptVariable,
    promptVariables,
    messagePlaceholders,
  } = usePlaygroundContext();
  const { name, value, isUsed, variableType = "string" } = promptVariable;
  const { isVariableConflicting } = useNamingConflicts(
    promptVariables,
    messagePlaceholders,
  );
  const hasConflict = isVariableConflicting(name);

  const isJsonInvalid =
    variableType === "json" &&
    value.trim() !== "" &&
    (() => {
      try {
        JSON.parse(value);
        return false;
      } catch {
        return true;
      }
    })();

  const handleInputChange = (value: string) => {
    updatePromptVariableValue(name, value);
  };
  const handleDeleteVariable = () => {
    deletePromptVariable(name);
  };
  const handleTypeChange = (type: PromptVariableType) => {
    updatePromptVariableType?.(name, type);
  };

  const isUsedIcon = isUsed ? (
    <CheckCircle2 size={16} color="green" />
  ) : (
    <Circle size={16} color="grey" />
  );
  const isUsedTooltip = isUsed
    ? "Variable is in use"
    : "Variable is not in use";

  return (
    <div className="p-1">
      <div className="mb-1 flex flex-row items-center">
        <span className="flex flex-1 flex-row space-x-2 text-xs">
          <p title={isUsedTooltip}>{isUsedIcon}</p>
          <p
            className={`min-w-[90px] truncate font-mono ${hasConflict ? "text-red-500" : ""}`}
            title={name}
          >
            {name}
          </p>
        </span>
        <Select
          value={variableType}
          onValueChange={(v) => handleTypeChange(v as PromptVariableType)}
        >
          <SelectTrigger className="mr-1 h-5 w-16 px-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="string" className="text-xs">
              String
            </SelectItem>
            <SelectItem value="json" className="text-xs">
              JSON
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          title="Delete variable"
          disabled={isUsed}
          onClick={handleDeleteVariable}
          className="p-0"
        >
          {!isUsed && <TrashIcon size={16} />}
        </Button>
      </div>

      <CodeMirrorEditor
        value={value}
        onChange={(e) => handleInputChange(e)}
        mode={variableType === "json" ? "json" : "prompt"}
        className={`max-h-40 w-full resize-y p-1 font-mono text-xs focus:outline-hidden ${
          hasConflict || isJsonInvalid ? "border border-red-500" : ""
        }`}
        editable={true}
        lineNumbers={false}
        placeholder={
          variableType === "json" ? '["array"] or {"key": "val"}' : name
        }
        enableSearchKeymap={false}
      />

      {hasConflict && (
        <p className="mt-1 text-xs text-red-500">
          Variable name conflicts with placeholder. Names must be unique.
        </p>
      )}
      {isJsonInvalid && (
        <p className="mt-1 text-xs text-red-500">Invalid JSON</p>
      )}
    </div>
  );
};
