import { type ChangeEvent } from "react";
import { CheckCircle2, Circle, TrashIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { type PromptVariable } from "@langfuse/shared";

import { usePlaygroundContext } from "../context";

export const PromptVariableComponent: React.FC<{
  promptVariable: PromptVariable;
}> = ({ promptVariable }) => {
  const { updatePromptVariableValue, deletePromptVariable } =
    usePlaygroundContext();
  const { name, value, isUsed } = promptVariable;

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    updatePromptVariableValue(name, event.target.value);
  };
  const handleDeleteVariable = () => {
    deletePromptVariable(name);
  };
  const displayName = name.slice(0, 10) + (name.length > 10 ? "..." : "");
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
          <p className="min-w-[90px] font-mono" title={name}>
            {displayName}
          </p>
        </span>
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
      <Textarea
        className="max-h-[10rem] min-h-[3rem] w-full resize-y pt-3 font-mono text-xs focus:outline-none"
        value={value}
        onChange={handleInputChange}
        placeholder={name}
      />
    </div>
  );
};
