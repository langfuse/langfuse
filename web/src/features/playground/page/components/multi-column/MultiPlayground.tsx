import React, { useEffect } from "react";

import { cn } from "@/src/utils/tailwind";
import { useMultiPlaygroundContext } from "@/src/features/playground/page/context/multi-playground-context";
import { PlaygroundColumn } from "./PlaygroundColumn";
import { AddColumnButton } from "./AddColumnButton";
import { GlobalVariablesPanel } from "./GlobalVariablesPanel";
import { GlobalSubmitBar } from "./GlobalSubmitBar";
import useCommandEnter from "@/src/features/playground/page/hooks/useCommandEnter";

interface MultiPlaygroundProps {
  className?: string;
}

export const MultiPlayground: React.FC<MultiPlaygroundProps> = ({
  className,
}) => {
  const {
    columns,
    addColumn,
    removeColumn,
    handleSubmitAll,
    isAnyStreaming,
  } = useMultiPlaygroundContext();

  // Global keyboard shortcut for Ctrl+Enter
  useCommandEnter(!isAnyStreaming, async () => {
    await handleSubmitAll(true); // Default to streaming enabled
  });

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Columns Container with Horizontal Scroll */}
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full overflow-x-auto gap-4 p-4 min-h-0">
          {columns.map((column, index) => (
            <PlaygroundColumn
              key={column.id}
              column={column}
              columnIndex={index}
              isFirst={index === 0}
              onRemove={() => removeColumn(column.id)}
              // TODO: Add onSave handler for individual column saving
            />
          ))}
          
          {/* Add Column Button */}
          {columns.length < 10 && (
            <AddColumnButton
              onClick={addColumn}
              disabled={columns.length >= 10}
            />
          )}
        </div>
      </div>
      
      {/* Global Variables Panel */}
      <GlobalVariablesPanel />
      
      {/* Global Submit Bar */}
      <GlobalSubmitBar />
    </div>
  );
};