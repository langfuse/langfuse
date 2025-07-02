# Multi-Column Playground Implementation Plan

## Executive Summary

This document outlines the implementation plan for transitioning the Langfuse playground from a single-column to a multi-column layout, supporting 1-10 configurable columns with individual syncing/unsyncing of settings per column. The plan maintains compatibility with the existing React/Next.js architecture while introducing new state management abstractions and UI components.

## Current Architecture Analysis

### Existing Structure
The current playground implementation consists of:

**Main Components:**
- `PlaygroundPage` (`web/src/features/playground/page/index.tsx`) - Entry point with header controls
- `Playground` (`web/src/features/playground/page/playground.tsx`) - Main layout with 75%/25% split
- `PlaygroundProvider` (`web/src/features/playground/page/context/index.tsx`) - Single context state management

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────┐
│ Header (Save to Prompt, Reset)                              │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────────────────┐ │
│ │ Messages (75%)      │ │ Config Panel (25%)              │ │
│ │ - Chat Messages     │ │ - Model Parameters              │ │
│ │ - Generation Output │ │ - Tools                         │ │
│ │ - Submit Button     │ │ - Structured Output             │ │
│ │                     │ │ - Variables                     │ │
│ │                     │ │ - Message Placeholders         │ │
│ └─────────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**State Management:**
- Single `PlaygroundContext` with all state in one object
- State includes: `messages`, `modelParams`, `tools`, `structuredOutputSchema`, `promptVariables`, `messagePlaceholders`, `output`, etc.
- Global keyboard shortcut handling (`Ctrl+Enter`) for submission

## Proposed Multi-Column Architecture

### Target Layout Structure
```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Header (Save Column Dropdown, Reset All, Add Column)                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐         │
│ │ Column 1        │ │ Column 2        │ │ Column 3        │ │ Column N        │ ←scroll │
│ │ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │         │
│ │ │ Messages    │ │ │ │ Messages    │ │ │ │ Messages    │ │ │ │ Messages    │ │         │
│ │ │ - Chat      │ │ │ │ - Chat      │ │ │ │ - Chat      │ │ │ │ - Chat      │ │         │
│ │ │ - Output    │ │ │ │ - Output    │ │ │ │ - Output    │ │ │ │ - Output    │ │         │
│ │ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │         │
│ │ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │         │
│ │ │ Config      │ │ │ │ Config      │ │ │ │ Config      │ │ │ │ Config      │ │         │
│ │ │ - Model 🔗  │ │ │ │ - Model 🔗  │ │ │ │ - Model 🔓  │ │ │ │ - Model 🔗  │ │         │
│ │ │ - Tools 🔗  │ │ │ │ - Tools 🔗  │ │ │ │ - Tools 🔗  │ │ │ │ - Tools 🔗  │ │         │
│ │ │ - Schema 🔗 │ │ │ │ - Schema 🔗 │ │ │ │ - Schema 🔗 │ │ │ │ - Schema 🔗 │ │         │
│ │ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │         │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘         │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Global Variables Panel                                                                   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

Legend: 🔗 = Synced, 🔓 = Unsynced

## Implementation Plan

### Phase 1: State Management Refactor

#### 1.1 Create Multi-Column State Structure

**New Types (`web/src/features/playground/page/types.ts`):**
```typescript
export interface PlaygroundColumnState {
  id: string;
  messages: ChatMessageWithId[];
  modelParams: UIModelParams;
  tools: PlaygroundTool[];
  structuredOutputSchema: PlaygroundSchema | null;
  messagePlaceholders: PlaceholderMessageFillIn[];
  output: string;
  outputJson: string;
  outputToolCalls: LLMToolCall[];
  isStreaming: boolean;
}

export interface SyncSettings {
  modelParams: boolean;
  tools: boolean;
  structuredOutputSchema: boolean;
  messages: boolean; // Optional - might default to false
}

export interface MultiPlaygroundState {
  columns: PlaygroundColumnState[];
  syncSettings: SyncSettings;
  promptVariables: PromptVariable[]; // Global
  availableProviders: ModelProvider[];
  availableModels: ModelDefinition[];
}
```

#### 1.2 Create Multi-Column Context

**New Context (`web/src/features/playground/page/context/multi-playground-context.tsx`):**
```typescript
interface MultiPlaygroundContextType {
  // Column management
  columns: PlaygroundColumnState[];
  addColumn: () => void;
  removeColumn: (columnId: string) => void;
  
  // Sync management
  syncSettings: SyncSettings;
  toggleSync: (setting: keyof SyncSettings) => void;
  
  // Column-specific operations
  updateColumnState: (columnId: string, updates: Partial<PlaygroundColumnState>) => void;
  updateColumnMessages: (columnId: string, messages: ChatMessageWithId[]) => void;
  updateColumnModelParams: (columnId: string, params: Partial<UIModelParams>) => void;
  updateColumnTools: (columnId: string, tools: PlaygroundTool[]) => void;
  updateColumnSchema: (columnId: string, schema: PlaygroundSchema | null) => void;
  
  // Global operations
  promptVariables: PromptVariable[];
  updatePromptVariableValue: (variable: string, value: string) => void;
  deletePromptVariable: (variable: string) => void;
  
  // Execution
  handleSubmitAll: (streaming?: boolean) => Promise<void>;
  isAnyStreaming: boolean;
}
```

#### 1.3 Sync Logic Implementation

**Sync Propagation Strategy:**
- When sync is enabled for a category, changes to any column propagate to all columns
- When sync is disabled, columns maintain independent state
- Use a "master column" approach (first column) as the source of truth for synced settings
- Implement deep equality checks to prevent unnecessary re-renders

### Phase 2: UI Component Refactoring

#### 2.1 Create Column-Aware Components

**New Components Structure:**
```
web/src/features/playground/page/components/
├── multi-column/
│   ├── MultiPlayground.tsx          # Main multi-column container
│   ├── PlaygroundColumn.tsx         # Individual column wrapper
│   ├── ColumnHeader.tsx             # Column title and controls
│   ├── SyncToggle.tsx              # Link/unlink toggle component
│   └── GlobalVariablesPanel.tsx    # Bottom global variables
├── column-adapters/
│   ├── ColumnMessages.tsx          # Messages wrapper for column
│   ├── ColumnModelParameters.tsx   # Model params wrapper for column
│   ├── ColumnTools.tsx             # Tools wrapper for column
│   └── ColumnStructuredOutput.tsx  # Schema wrapper for column
```

#### 2.2 Multi-Column Layout Component

**MultiPlayground Component:**
```typescript
export const MultiPlayground: React.FC = () => {
  const {
    columns,
    addColumn,
    removeColumn,
    syncSettings,
    toggleSync,
    handleSubmitAll,
    isAnyStreaming
  } = useMultiPlaygroundContext();

  return (
    <div className="flex h-full flex-col">
      {/* Columns Container */}
      <div className="flex flex-1 overflow-x-auto gap-4 p-4">
        {columns.map((column, index) => (
          <PlaygroundColumn
            key={column.id}
            column={column}
            columnIndex={index}
            isFirst={index === 0}
            onRemove={() => removeColumn(column.id)}
          />
        ))}
        
        {/* Add Column Button */}
        {columns.length < 10 && (
          <AddColumnButton onClick={addColumn} />
        )}
      </div>
      
      {/* Global Variables Panel */}
      <GlobalVariablesPanel />
      
      {/* Global Submit Button */}
      <GlobalSubmitBar
        onSubmit={handleSubmitAll}
        isLoading={isAnyStreaming}
      />
    </div>
  );
};
```

#### 2.3 Individual Column Component

**PlaygroundColumn Component:**
```typescript
interface PlaygroundColumnProps {
  column: PlaygroundColumnState;
  columnIndex: number;
  isFirst: boolean;
  onRemove: () => void;
}

export const PlaygroundColumn: React.FC<PlaygroundColumnProps> = ({
  column,
  columnIndex,
  isFirst,
  onRemove
}) => {
  return (
    <div className="flex flex-col min-w-[400px] max-w-[500px] flex-1 border rounded-lg">
      {/* Column Header */}
      <ColumnHeader
        title={`Column ${columnIndex + 1}`}
        columnId={column.id}
        showRemove={!isFirst}
        onRemove={onRemove}
      />
      
      {/* Column Content */}
      <div className="flex flex-1 flex-col p-4 gap-4">
        {/* Messages Section */}
        <div className="flex-1">
          <PlaygroundColumnProvider columnId={column.id}>
            <ColumnMessages />
          </PlaygroundColumnProvider>
        </div>
        
        {/* Config Sections */}
        <div className="space-y-4">
          <SyncableSection
            title="Model"
            syncKey="modelParams"
            columnId={column.id}
          >
            <ColumnModelParameters />
          </SyncableSection>
          
          <SyncableSection
            title="Tools"
            syncKey="tools"
            columnId={column.id}
          >
            <ColumnTools />
          </SyncableSection>
          
          <SyncableSection
            title="Structured Output"
            syncKey="structuredOutputSchema"
            columnId={column.id}
          >
            <ColumnStructuredOutput />
          </SyncableSection>
        </div>
      </div>
    </div>
  );
};
```

### Phase 3: Responsive Design & Layout

#### 3.1 Horizontal Scrolling Implementation

**CSS/Tailwind Classes:**
```css
.multi-playground-container {
  @apply flex overflow-x-auto;
  scroll-behavior: smooth;
}

.playground-column {
  @apply min-w-[400px] max-w-[500px] flex-1;
  /* Ensures columns maintain readable width */
}

/* Responsive breakpoints */
@media (max-width: 1200px) {
  .playground-column {
    @apply min-w-[350px] max-w-[450px];
  }
}

@media (max-width: 768px) {
  .playground-column {
    @apply min-w-[300px] max-w-[400px];
  }
}
```

#### 3.2 Column Layout Optimization

**Compact Design Strategy:**
- Reduce padding and margins in multi-column mode
- Use collapsible sections for less frequently used settings
- Implement tabbed interface for config sections if needed
- Optimize text sizes and spacing for readability

### Phase 4: Sync Controls Implementation

#### 4.1 Sync Toggle Component

**SyncToggle Component:**
```typescript
interface SyncToggleProps {
  syncKey: keyof SyncSettings;
  columnId: string;
  isEnabled: boolean;
  onToggle: () => void;
}

export const SyncToggle: React.FC<SyncToggleProps> = ({
  syncKey,
  isEnabled,
  onToggle
}) => {
  return (
    <Tooltip content={isEnabled ? "Unlink from other columns" : "Link to other columns"}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className={cn(
          "h-6 w-6 p-0",
          isEnabled ? "text-blue-600" : "text-gray-400"
        )}
      >
        {isEnabled ? <Link className="h-4 w-4" /> : <Unlink className="h-4 w-4" />}
      </Button>
    </Tooltip>
  );
};
```

#### 4.2 Syncable Section Wrapper

**SyncableSection Component:**
```typescript
interface SyncableSectionProps {
  title: string;
  syncKey: keyof SyncSettings;
  columnId: string;
  children: React.ReactNode;
}

export const SyncableSection: React.FC<SyncableSectionProps> = ({
  title,
  syncKey,
  columnId,
  children
}) => {
  const { syncSettings, toggleSync } = useMultiPlaygroundContext();
  const isLinked = syncSettings[syncKey];
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        <SyncToggle
          syncKey={syncKey}
          columnId={columnId}
          isEnabled={isLinked}
          onToggle={() => toggleSync(syncKey)}
        />
      </div>
      <div className={cn(
        "transition-opacity",
        isLinked && "opacity-75" // Visual indication of sync state
      )}>
        {children}
      </div>
    </div>
  );
};
```

### Phase 5: Execution & Submission

#### 5.1 Multi-Column Execution

**Global Submit Implementation:**
```typescript
const handleSubmitAll = useCallback(async (streaming = true) => {
  try {
    setGlobalLoading(true);
    
    // Execute all columns in parallel
    const executionPromises = columns.map(async (column, index) => {
      try {
        setColumnStreaming(column.id, true);
        
        const finalMessages = getFinalMessages(
          promptVariables,
          column.messages,
          column.messagePlaceholders
        );
        
        // Execute based on column configuration
        const result = await executeColumn({
          messages: finalMessages,
          modelParams: column.modelParams,
          tools: column.tools,
          structuredOutputSchema: column.structuredOutputSchema,
          streaming
        });
        
        // Update column output
        updateColumnState(column.id, {
          output: result.output,
          outputJson: result.outputJson,
          outputToolCalls: result.toolCalls || []
        });
        
      } catch (error) {
        // Handle individual column errors
        updateColumnState(column.id, {
          output: `Error: ${error.message}`
        });
      } finally {
        setColumnStreaming(column.id, false);
      }
    });
    
    await Promise.allSettled(executionPromises);
    
  } finally {
    setGlobalLoading(false);
  }
}, [columns, promptVariables, updateColumnState]);
```

#### 5.2 Keyboard Shortcut Update

**Global Ctrl+Enter Handler:**
```typescript
// Update useCommandEnter hook to work with multi-column
export const useMultiColumnCommandEnter = (
  isEnabled: boolean,
  callback: () => Promise<void>
) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        isEnabled &&
        (event.metaKey || event.ctrlKey) &&
        event.code === "Enter"
      ) {
        event.preventDefault();
        callback().catch(console.error);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEnabled, callback]);
};
```

### Phase 6: Prompt Management Updates

#### 6.1 Save to Prompt Functionality

**Multi-Column Save Implementation:**
```typescript
// Update SaveToPromptButton to handle multiple columns
export const MultiColumnSaveToPromptButton: React.FC = () => {
  const { columns } = useMultiPlaygroundContext();
  const [selectedColumnId, setSelectedColumnId] = useState<string>("");
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <FileInput className="mr-1 h-4 w-4" />
          Save as prompt
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Select column to save</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column, index) => (
          <DropdownMenuItem
            key={column.id}
            onClick={() => handleSaveColumn(column)}
          >
            Save Column {index + 1}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
```

#### 6.2 Reset Functionality

**Multi-Column Reset:**
```typescript
const handleResetAll = useCallback(() => {
  // Reset to single column with default state
  setColumns([createDefaultColumn()]);
  setSyncSettings({
    modelParams: true,
    tools: true,
    structuredOutputSchema: true,
    messages: false
  });
  setPromptVariables([]);
  setPlaygroundCache(null);
}, []);
```

### Phase 7: Migration Strategy

#### 7.1 Backward Compatibility

**Gradual Migration Approach:**
1. Keep existing `PlaygroundProvider` functional
2. Create new `MultiPlaygroundProvider` alongside
3. Update page component to use multi-column by default
4. Ensure single-column mode works as subset of multi-column

#### 7.2 Feature Flag Implementation

**Optional Feature Toggle:**
```typescript
// Add feature flag for multi-column mode
const useMultiColumnMode = () => {
  const [isMultiColumn, setIsMultiColumn] = useLocalStorage(
    'langfuse-playground-multi-column',
    true // Default to multi-column
  );
  
  return { isMultiColumn, toggleMode: () => setIsMultiColumn(!isMultiColumn) };
};
```

### Phase 8: Testing Strategy

#### 8.1 Unit Tests
- Test sync logic with various combinations
- Test column addition/removal
- Test state isolation between columns
- Test execution flow

#### 8.2 Integration Tests
- Test full workflow: add columns, configure, execute, save
- Test keyboard shortcuts
- Test responsive behavior
- Test error handling

#### 8.3 Performance Tests
- Test with maximum columns (10)
- Test concurrent execution
- Test large prompt/output handling
- Test memory usage

## Implementation Timeline

### Week 1-2: Foundation
- [ ] Create new type definitions
- [ ] Implement basic multi-column state management
- [ ] Create core context and providers

### Week 3-4: UI Components
- [ ] Build MultiPlayground container component
- [ ] Create PlaygroundColumn component
- [ ] Implement sync toggle controls
- [ ] Add responsive layout

### Week 5-6: Integration
- [ ] Integrate existing components with new structure
- [ ] Implement execution logic
- [ ] Update keyboard shortcuts
- [ ] Add global variables panel

### Week 7-8: Polish & Testing
- [ ] Implement save/reset functionality
- [ ] Add comprehensive testing
- [ ] Performance optimization
- [ ] Documentation updates

## Risk Mitigation

### Technical Risks
1. **State Complexity**: Mitigate with clear separation of concerns and thorough testing
2. **Performance**: Use React.memo, useMemo, and efficient re-rendering strategies
3. **UI Complexity**: Implement progressive disclosure and maintain intuitive UX

### User Experience Risks
1. **Learning Curve**: Provide clear visual indicators and helpful defaults
2. **Mobile Experience**: Ensure responsive design works on smaller screens
3. **Overwhelming Interface**: Use collapsible sections and smart defaults

## Success Metrics

1. **Functionality**: All existing single-column features work in multi-column mode
2. **Performance**: No significant performance degradation with up to 10 columns
3. **Usability**: Users can successfully compare prompts/models side-by-side
4. **Maintainability**: Code remains modular and testable

## Conclusion

This implementation plan provides a comprehensive roadmap for transitioning the Langfuse playground to a multi-column architecture while maintaining the existing functionality and user experience. The phased approach ensures manageable development cycles and reduces risk through incremental delivery.

The key innovations include:
- Flexible state management supporting 1-10 columns
- Granular sync controls for different setting categories  
- Responsive design that adapts to various screen sizes
- Backward compatibility with existing workflows
- Performance-optimized execution of multiple columns

This design empowers users to efficiently compare different prompts, models, and configurations side-by-side, significantly enhancing the playground's utility for prompt engineering and model evaluation workflows.