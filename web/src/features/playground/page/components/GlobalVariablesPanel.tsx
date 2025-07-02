import React from "react";
import { VariableIcon } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { useMultiPlaygroundContext } from "../context/multi-playground-context";
import { cn } from "@/src/utils/tailwind";

export const GlobalVariablesPanel: React.FC = () => {
  const { state, updatePromptVariable } = useMultiPlaygroundContext();
  
  if (state.promptVariables.length === 0) return null;
  
  return (
    <div className="border-t bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <VariableIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">Global Variables</span>
        <span className="text-xs text-muted-foreground">
          (shared across all columns)
        </span>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {state.promptVariables.map(variable => (
          <div key={variable.name} className="flex items-center gap-2">
            <label 
              className={cn(
                "text-sm font-mono",
                variable.isUsed ? "text-foreground" : "text-muted-foreground"
              )}
              title={variable.isUsed ? "Used in prompts" : "Not used in any prompt"}
            >
              {`{{${variable.name}}}`}:
            </label>
            <Input
              value={variable.value}
              onChange={(e) => updatePromptVariable(variable.name, e.target.value)}
              className="h-8 flex-1"
              placeholder="Value"
            />
          </div>
        ))}
      </div>
    </div>
  );
};