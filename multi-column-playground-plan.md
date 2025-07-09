# Multi-Column Playground Implementation Plan

## Overview

This document outlines the implementation plan for transitioning the Langfuse playground from a single-column to a multi-column interface, supporting up to 10 concurrent playground instances with configurable syncing of settings.

## Current Architecture Analysis

### State Management
- **Single Context**: `PlaygroundContext` manages all state for one playground instance
- **Key State Elements**:
  - `messages`: Chat messages array
  - `modelParams`: Model configuration (provider, model, temperature, etc.)
  - `tools`: Array of tool definitions
  - `structuredOutputSchema`: JSON schema for structured outputs
  - `promptVariables`: Template variables (global by nature)
  - `messagePlaceholders`: Message template placeholders
  - `output`, `outputJson`, `outputToolCalls`: Generation results

### UI Structure
- **Layout**: 75% prompt editor (left) + 25% config panel (right)
- **Components**:
  - `Messages`: Chat interface with resizable output panel
  - `ModelParameters`: Model selection and settings
  - `PlaygroundTools`: Tool management
  - `StructuredOutputSchemaSection`: Schema configuration
  - `Variables` & `MessagePlaceholders`: Template variable inputs

## Implementation Strategy

### Phase 1: State Architecture Refactor

#### 1.1 Multi-Column State Structure

```typescript
// New types in types.ts
export interface PlaygroundColumnState {
  id: string;
  messages: ChatMessageWithId[];
  modelParams: UIModelParams;
  tools: PlaygroundTool[];
  structuredOutputSchema: PlaygroundSchema | null;
  output: string;
  outputJson: string;
  outputToolCalls: LLMToolCall[];
  isStreaming: boolean;
  // Sync flags per category
  syncFlags: {
    prompt: boolean;
    modelParams: boolean;
    tools: boolean;
    structuredOutput: boolean;
  };
}

export interface MultiPlaygroundState {
  columns: PlaygroundColumnState[];
  // Global state
  promptVariables: PromptVariable[];
  messagePlaceholders: PlaceholderMessageFillIn[];
  // Global sync settings
  globalSyncEnabled: boolean;
}
```

#### 1.2 New Context Structure

Create `MultiPlaygroundContext`:

```typescript
// web/src/features/playground/page/context/multi-playground-context.tsx
export const MultiPlaygroundContext = createContext<{
  state: MultiPlaygroundState;
  
  // Column management
  addColumn: () => void;
  removeColumn: (columnId: string) => void;
  duplicateColumn: (columnId: string) => void;
  
  // Column state updates
  updateColumnState: (columnId: string, updates: Partial<PlaygroundColumnState>) => void;
  
  // Sync management
  toggleColumnSync: (columnId: string, category: keyof PlaygroundColumnState['syncFlags']) => void;
  toggleGlobalSync: () => void;
  
  // Global state
  updatePromptVariable: (name: string, value: string) => void;
  updateMessagePlaceholder: (name: string, value: ChatMessage[]) => void;
  
  // Execution
  executeAllColumns: () => Promise<void>;
  executeColumn: (columnId: string) => Promise<void>;
}>();
```

#### 1.3 Column Provider Wrapper

Reuse existing `PlaygroundContext` for each column:

```typescript
// web/src/features/playground/page/components/PlaygroundColumnProvider.tsx
export const PlaygroundColumnProvider: React.FC<{
  columnState: PlaygroundColumnState;
  onStateChange: (updates: Partial<PlaygroundColumnState>) => void;
  children: React.ReactNode;
}> = ({ columnState, onStateChange, children }) => {
  // Adapt column state to existing PlaygroundContext interface
  const contextValue = useMemo(() => ({
    messages: columnState.messages,
    modelParams: columnState.modelParams,
    tools: columnState.tools,
    // ... map all fields
    
    // Update handlers that call onStateChange
    setMessages: (messages) => onStateChange({ messages }),
    updateModelParamValue: (key, value) => {
      onStateChange({
        modelParams: {
          ...columnState.modelParams,
          [key]: { ...columnState.modelParams[key], value }
        }
      });
    },
    // ... implement all update methods
  }), [columnState, onStateChange]);
  
  return (
    <PlaygroundContext.Provider value={contextValue}>
      {children}
    </PlaygroundContext.Provider>
  );
};
```

### Phase 2: UI Components

#### 2.1 Multi-Playground Layout

```typescript
// web/src/features/playground/page/multi-playground.tsx
export const MultiPlayground: React.FC = () => {
  const { state, addColumn, executeAllColumns } = useMultiPlaygroundContext();
  
  return (
    <div className="flex h-full flex-col">
      {/* Global controls */}
      <div className="flex items-center justify-between border-b p-2">
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
          onClick={executeAllColumns}
          disabled={state.columns.some(c => c.isStreaming)}
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
```

#### 2.2 Individual Column Component

```typescript
// web/src/features/playground/page/components/PlaygroundColumn.tsx
export const PlaygroundColumn: React.FC<{
  column: PlaygroundColumnState;
  index: number;
  totalColumns: number;
}> = ({ column, index, totalColumns }) => {
  const { updateColumnState, removeColumn, toggleColumnSync } = useMultiPlaygroundContext();
  
  // Calculate responsive width
  const columnWidth = totalColumns <= 3 ? `${100 / totalColumns}%` : '400px';
  
  return (
    <div 
      className="flex-shrink-0 border-r last:border-r-0"
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
          />
          
          {/* Column content with vertical layout */}
          <div className="flex-1 overflow-y-auto">
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={60} minSize={30}>
                <div className="p-2">
                  <Messages {...usePlaygroundContext()} />
                </div>
              </ResizablePanel>
              
              <ResizableHandle />
              
              <ResizablePanel defaultSize={40} minSize={20}>
                <div className="p-2 space-y-4">
                  <CollapsibleSection
                    title="Model"
                    syncable
                    synced={column.syncFlags.modelParams}
                    onSyncToggle={() => toggleColumnSync(column.id, 'modelParams')}
                  >
                    <ModelParameters {...usePlaygroundContext()} />
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
```

#### 2.3 Sync UI Component

```typescript
// web/src/features/playground/page/components/CollapsibleSection.tsx
export const CollapsibleSection: React.FC<{
  title: string;
  syncable?: boolean;
  synced?: boolean;
  onSyncToggle?: () => void;
  children: React.ReactNode;
}> = ({ title, syncable, synced, onSyncToggle, children }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <div className="border rounded-md">
      <div className="flex items-center justify-between p-2 cursor-pointer"
           onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-2">
          <ChevronRightIcon 
            className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")}
          />
          <span className="font-medium text-sm">{title}</span>
        </div>
        
        {syncable && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onSyncToggle?.();
            }}
            title={synced ? "Synced across columns" : "Independent per column"}
          >
            {synced ? <LinkIcon className="h-3 w-3" /> : <UnlinkIcon className="h-3 w-3" />}
          </Button>
        )}
      </div>
      
      {isOpen && (
        <div className="p-2 pt-0">
          {children}
        </div>
      )}
    </div>
  );
};
```

### Phase 3: Sync Logic Implementation

#### 3.1 Sync Mechanism

```typescript
// In MultiPlaygroundContext implementation
const handleColumnUpdate = (columnId: string, updates: Partial<PlaygroundColumnState>) => {
  setColumns(prevColumns => {
    const columnIndex = prevColumns.findIndex(c => c.id === columnId);
    if (columnIndex === -1) return prevColumns;
    
    const updatedColumn = { ...prevColumns[columnIndex], ...updates };
    const newColumns = [...prevColumns];
    newColumns[columnIndex] = updatedColumn;
    
    // Apply sync logic
    Object.keys(updates).forEach(key => {
      const syncKey = key as keyof PlaygroundColumnState['syncFlags'];
      
      // Check if this property should be synced
      if (updatedColumn.syncFlags[syncKey] && globalSyncEnabled) {
        // Apply to all other columns that have sync enabled for this property
        newColumns.forEach((col, idx) => {
          if (idx !== columnIndex && col.syncFlags[syncKey]) {
            newColumns[idx] = {
              ...newColumns[idx],
              [key]: updates[key]
            };
          }
        });
      }
    });
    
    return newColumns;
  });
};
```

#### 3.2 Global Variables Panel

```typescript
// web/src/features/playground/page/components/GlobalVariablesPanel.tsx
export const GlobalVariablesPanel: React.FC = () => {
  const { state, updatePromptVariable } = useMultiPlaygroundContext();
  
  if (state.promptVariables.length === 0) return null;
  
  return (
    <div className="border-t bg-muted/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <VariableIcon className="h-4 w-4" />
        <span className="font-medium text-sm">Global Variables</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {state.promptVariables.map(variable => (
          <div key={variable.name} className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">
              {variable.name}:
            </label>
            <Input
              value={variable.value}
              onChange={(e) => updatePromptVariable(variable.name, e.target.value)}
              className="h-8"
              placeholder="Value"
            />
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Phase 4: Execution Logic

#### 4.1 Parallel Execution

```typescript
// In MultiPlaygroundContext
const executeAllColumns = async () => {
  // Mark all columns as streaming
  setColumns(prev => prev.map(col => ({ ...col, isStreaming: true })));
  
  try {
    // Execute all columns in parallel
    const executions = state.columns.map(column => 
      executeColumnInternal(column)
    );
    
    const results = await Promise.allSettled(executions);
    
    // Update each column with its result
    results.forEach((result, index) => {
      const columnId = state.columns[index].id;
      
      if (result.status === 'fulfilled') {
        updateColumnState(columnId, {
          output: result.value.output,
          outputJson: result.value.outputJson,
          outputToolCalls: result.value.outputToolCalls,
          isStreaming: false
        });
      } else {
        // Handle error for this column
        updateColumnState(columnId, {
          output: `Error: ${result.reason}`,
          isStreaming: false
        });
      }
    });
  } catch (error) {
    console.error('Failed to execute columns:', error);
  }
};
```

### Phase 5: Integration & Migration

#### 5.1 Page-Level Switch

```typescript
// web/src/features/playground/page/index.tsx
export default function PlaygroundPage() {
  const [multiColumnMode, setMultiColumnMode] = useState(false);
  
  return multiColumnMode ? (
    <MultiPlaygroundProvider>
      <Page
        withPadding
        headerProps={{
          title: "Multi-Column Playground",
          actionButtonsRight: (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMultiColumnMode(false)}
              >
                Single Mode
              </Button>
              <SaveColumnDropdown />
              <ResetAllButton />
            </>
          ),
        }}
      >
        <div className="flex-1 overflow-hidden">
          <MultiPlayground />
        </div>
      </Page>
    </MultiPlaygroundProvider>
  ) : (
    // Existing single playground code
    <PlaygroundProvider>
      {/* ... existing implementation ... */}
    </PlaygroundProvider>
  );
}
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Create multi-column state types and context
- [ ] Implement column state management
- [ ] Create PlaygroundColumnProvider adapter

### Week 2: UI Components
- [ ] Build MultiPlayground layout component
- [ ] Create PlaygroundColumn component
- [ ] Implement CollapsibleSection with sync controls
- [ ] Add GlobalVariablesPanel

### Week 3: Sync Logic
- [ ] Implement sync propagation mechanism
- [ ] Add sync toggle functionality
- [ ] Test sync behavior across columns

### Week 4: Execution & Polish
- [ ] Implement parallel execution
- [ ] Add keyboard shortcuts
- [ ] Create save/load functionality for columns
- [ ] Performance optimization
- [ ] Testing and bug fixes

## Technical Considerations

### Performance
- Use React.memo for column components to prevent unnecessary re-renders
- Implement virtualization if column count > 5
- Debounce sync updates to prevent lag

### State Management
- Consider using useReducer for complex state updates
- Implement undo/redo functionality for column changes
- Add state persistence to localStorage

### Responsive Design
- Minimum column width: 300px
- Maximum visible columns: 4 (before scroll)
- Mobile: Stack columns vertically

### Accessibility
- Keyboard navigation between columns
- Screen reader announcements for sync changes
- Focus management when adding/removing columns

## Testing Strategy

### Unit Tests
- State management logic
- Sync propagation
- Column CRUD operations

### Integration Tests
- Multi-column execution
- Sync behavior across columns
- Save/load functionality

### E2E Tests
- Complete user workflows
- Performance with max columns
- Error handling scenarios

## Migration Notes

1. **Backward Compatibility**: Single playground mode remains default
2. **Feature Flag**: Use environment variable to enable multi-column during development
3. **Data Migration**: Existing playground cache works with column[0] in multi-mode
4. **URL Structure**: Add `?mode=multi` to enable multi-column view

## Future Enhancements

1. **Diff View**: Compare outputs between columns
2. **Templates**: Save multi-column configurations
3. **Export**: Export all column results as comparison table
4. **Metrics**: Show performance metrics per column
5. **Collaboration**: Share multi-column setups with team