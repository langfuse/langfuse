import { type ChangeEvent } from "react";
import { usePlaygroundContext } from "../context";
import { Input } from "@/src/components/ui/input";
import { CheckCircle2, Circle, Trash2Icon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { type PromptVariable } from "@langfuse/shared";

export const PromptVariableComponent: React.FC<{
  promptVariable: PromptVariable;
}> = ({ promptVariable }) => {
  const { updatePromptVariableValue, deletePromptVariable } =
    usePlaygroundContext();
  const { name, value, isUsed } = promptVariable;

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
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
    <div className="my-2 flex flex-row items-center justify-center space-x-2 text-xs">
      <p title={isUsedTooltip}>{isUsedIcon}</p>
      <p className="min-w-[90px] font-mono" title={name}>
        {displayName}
      </p>
      <Input value={value} onChange={handleInputChange} placeholder={name} />
      <Button
        variant="ghost"
        size="icon"
        title="Delete variable"
        disabled={isUsed}
        onClick={handleDeleteVariable}
        className="p-0"
      >
        {!isUsed && <Trash2Icon size={16} />}
      </Button>
    </div>
  );
};
