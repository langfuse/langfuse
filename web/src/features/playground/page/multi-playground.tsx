import React from "react";
import { Button } from "@/src/components/ui/button";
import { PlusIcon, PlayIcon } from "lucide-react";
import { useMultiPlaygroundContext } from "./context/multi-playground-context";
import { PlaygroundColumn } from "./components/PlaygroundColumn";
import { GlobalVariablesPanel } from "./components/GlobalVariablesPanel";
import useCommandEnter from "./hooks/useCommandEnter";

export const MultiPlayground: React.FC = () => {
  const { state, addColumn, executeAllColumns } = useMultiPlaygroundContext();
  
  // Handle Ctrl+Enter to execute all columns
  useCommandEnter(
    !state.columns.some(c => c.isStreaming),
    async () => {
      await executeAllColumns();
    }
  );

  return (
    <div className="flex h-full flex-col">
      {/* Global controls */}
      <div className="flex items-center justify-between border-b p-2 bg-background">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={addColumn}
            disabled={state.columns.length >= 10}
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            Add Column
          </Button>
          <span className="text-sm text-muted-foreground">
            {state.columns.length} / 10 columns
          </span>
        </div>
        
        <Button
          onClick={() => executeAllColumns()}
          disabled={state.columns.some(c => c.isStreaming)}
          loading={state.columns.some(c => c.isStreaming)}
        >
          <PlayIcon className="h-4 w-4 mr-1" />
          Run All (Ctrl+Enter)
        </Button>
      </div>
      
      {/* Columns container */}
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full overflow-x-auto">
          {state.columns.map((column, index) => (
            <PlaygroundColumn
              key={column.id}
              column={column}
              index={index}
              totalColumns={state.columns.length}
            />
          ))}
        </div>
      </div>
      
      {/* Global variables panel */}
      <GlobalVariablesPanel />
    </div>
  );
};