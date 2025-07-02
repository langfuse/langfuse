import React from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { useMultiPlaygroundContext } from "../context/multi-playground-context";
import { PlaygroundColumnProvider, usePlaygroundContext } from "./PlaygroundColumnProvider";
import { Messages } from "./Messages";
import { ModelParameters } from "@/src/components/ModelParameters";
import { PlaygroundTools } from "./PlaygroundTools";
import { StructuredOutputSchemaSection } from "./StructuredOutputSchemaSection";
import { CollapsibleSection } from "./CollapsibleSection";
import { ColumnHeader } from "./ColumnHeader";
import type { PlaygroundColumnState } from "../types";

interface PlaygroundColumnProps {
  column: PlaygroundColumnState;
  index: number;
  totalColumns: number;
}

export const PlaygroundColumn: React.FC<PlaygroundColumnProps> = ({
  column,
  index,
  totalColumns,
}) => {
  const { updateColumnState, removeColumn, toggleColumnSync } = useMultiPlaygroundContext();
  
  // Calculate responsive width
  const columnWidth = totalColumns <= 3 ? `${100 / totalColumns}%` : '400px';
  
  return (
    <div 
      className="flex-shrink-0 border-r last:border-r-0 h-full"
      style={{ width: columnWidth, minWidth: '300px' }}
    >
      <PlaygroundColumnProvider
        columnState={column}
        onStateChange={(updates) => updateColumnState(column.id, updates)}
      >
        <div className="flex h-full flex-col">
          {/* Column header */}
          <ColumnHeader
            title={`Column ${index + 1}`}
            columnId={column.id}
            onRemove={() => removeColumn(column.id)}
            canRemove={totalColumns > 1}
            modelName={column.modelParams.model.value}
          />
          
          {/* Column content with vertical layout */}
          <div className="flex-1 overflow-hidden">
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={60} minSize={30}>
                <div className="h-full overflow-auto p-2">
                  <CollapsibleSection
                    title="Prompt"
                    syncable
                    synced={column.syncFlags.prompt}
                    onSyncToggle={() => toggleColumnSync(column.id, 'prompt')}
                    defaultOpen={true}
                  >
                    <ColumnMessages />
                  </CollapsibleSection>
                </div>
              </ResizablePanel>
              
              <ResizableHandle withHandle className="bg-transparent" />
              
              <ResizablePanel defaultSize={40} minSize={20}>
                <div className="h-full overflow-auto p-2 space-y-3">
                  <CollapsibleSection
                    title="Model"
                    syncable
                    synced={column.syncFlags.modelParams}
                    onSyncToggle={() => toggleColumnSync(column.id, 'modelParams')}
                  >
                    <ColumnModelParameters />
                  </CollapsibleSection>
                  
                  <CollapsibleSection
                    title="Tools"
                    syncable
                    synced={column.syncFlags.tools}
                    onSyncToggle={() => toggleColumnSync(column.id, 'tools')}
                  >
                    <PlaygroundTools />
                  </CollapsibleSection>
                  
                  <CollapsibleSection
                    title="Structured Output"
                    syncable
                    synced={column.syncFlags.structuredOutput}
                    onSyncToggle={() => toggleColumnSync(column.id, 'structuredOutput')}
                  >
                    <StructuredOutputSchemaSection />
                  </CollapsibleSection>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </PlaygroundColumnProvider>
    </div>
  );
};

// Wrapper components that use the column-specific context
const ColumnMessages: React.FC = () => {
  const context = usePlaygroundContext();
  return <Messages {...context} />;
};

const ColumnModelParameters: React.FC = () => {
  const context = usePlaygroundContext();
  return <ModelParameters {...context} />;
};