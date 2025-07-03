import React from "react";

import { cn } from "@/src/utils/tailwind";
import { type PlaygroundColumnState } from "@/src/features/playground/page/types";
import { PlaygroundColumnProvider } from "./PlaygroundColumnProvider";
import { ColumnHeader } from "./ColumnHeader";
import { SyncableSection } from "./SyncableSection";
import { ColumnMessages } from "./ColumnMessages";
import { ColumnModelParameters } from "./ColumnModelParameters";
import { PlaygroundTools } from "../PlaygroundTools";
import { StructuredOutputSchemaSection } from "../StructuredOutputSchemaSection";
import { MessagePlaceholders } from "../MessagePlaceholders";

interface PlaygroundColumnProps {
  column: PlaygroundColumnState;
  columnIndex: number;
  isFirst: boolean;
  onRemove: () => void;
  onSave?: () => void;
  className?: string;
}

export const PlaygroundColumn: React.FC<PlaygroundColumnProps> = ({
  column,
  columnIndex,
  isFirst,
  onRemove,
  onSave,
  className,
}) => {
  return (
    <div className={cn(
      "flex flex-col min-w-[400px] max-w-[500px] flex-1 border rounded-lg bg-background",
      className
    )}>
      {/* Column Header */}
      <ColumnHeader
        title={`Column ${columnIndex + 1}`}
        columnId={column.id}
        columnIndex={columnIndex}
        showRemove={!isFirst}
        onRemove={onRemove}
        onSave={onSave}
      />
      
      {/* Column Content */}
      <PlaygroundColumnProvider columnId={column.id}>
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages Section - Takes up most of the space */}
          <div className="flex-1 min-h-0 p-4">
            <ColumnMessages />
          </div>
          
          {/* Configuration Sections - Compact and scrollable */}
          <div className="border-t bg-muted/20">
            <div className="max-h-[400px] overflow-y-auto p-4 space-y-4">
              <SyncableSection
                title="Model"
                syncKey="modelParams"
                className="bg-background rounded-md p-3 border"
              >
                <ColumnModelParameters />
              </SyncableSection>
              
              <SyncableSection
                title="Tools"
                syncKey="tools"
                className="bg-background rounded-md p-3 border"
              >
                <div className="max-h-[200px] overflow-y-auto">
                  <PlaygroundTools />
                </div>
              </SyncableSection>
              
              <SyncableSection
                title="Structured Output"
                syncKey="structuredOutputSchema"
                className="bg-background rounded-md p-3 border"
              >
                <div className="max-h-[200px] overflow-y-auto">
                  <StructuredOutputSchemaSection />
                </div>
              </SyncableSection>
              
              {/* Message Placeholders - Always independent per column */}
              <div className="bg-background rounded-md p-3 border">
                <h3 className="font-semibold text-sm mb-2">Message Placeholders</h3>
                <div className="max-h-[150px] overflow-y-auto">
                  <MessagePlaceholders />
                </div>
              </div>
            </div>
          </div>
        </div>
      </PlaygroundColumnProvider>
    </div>
  );
};