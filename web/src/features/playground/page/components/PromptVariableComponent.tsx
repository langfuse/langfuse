import { CheckCircle2, Circle, TrashIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { type PromptVariable } from "@langfuse/shared";
import { CodeMirrorEditor } from "@/src/components/editor";

import { usePlaygroundContext } from "../context";
import { useNamingConflicts } from "../hooks/useNamingConflicts";
import { useTranslation } from "react-i18next";

export const PromptVariableComponent: React.FC<{
  promptVariable: PromptVariable;
}> = ({ promptVariable }) => {
  const { t } = useTranslation();
  const {
    updatePromptVariableValue,
    deletePromptVariable,
    promptVariables,
    messagePlaceholders,
  } = usePlaygroundContext();
  const { name, value, isUsed } = promptVariable;
  const { isVariableConflicting } = useNamingConflicts(
    promptVariables,
    messagePlaceholders,
  );
  const hasConflict = isVariableConflicting(name);

  const handleInputChange = (value: string) => {
    updatePromptVariableValue(name, value);
  };
  const handleDeleteVariable = () => {
    deletePromptVariable(name);
  };
  const isUsedIcon = isUsed ? (
    <CheckCircle2 size={16} color="green" />
  ) : (
    <Circle size={16} color="grey" />
  );
  const isUsedTooltip = isUsed
    ? t("playground.variableIsInUse")
    : t("playground.variableIsNotInUse");

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
        <Button
          variant="ghost"
          size="icon"
          title={t("playground.deleteVariable")}
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
        mode="prompt"
        minHeight="none"
        className={`max-h-[10rem] w-full resize-y p-1 font-mono text-xs focus:outline-none ${hasConflict ? "border border-red-500" : ""}`}
        editable={true}
        lineNumbers={false}
        placeholder={name}
      />

      {hasConflict && (
        <p className="mt-1 text-xs text-red-500">
          {t("playground.variableNameConflictsWithPlaceholder")}
        </p>
      )}
    </div>
  );
};
