# Multi-Window LLM Playground Enhancement Technical Specification

## 1. System Overview

### Core Purpose and Value Proposition

Extend the existing Langfuse playground to support multiple side-by-side prompt windows, enabling rapid iteration and comparison of different LLM configurations. This allows users to test variations of models, prompts, parameters, and variables simultaneously for efficient A/B testing and prompt optimization.

### Key Workflows

1. **Window Management Flow**: User starts with one window → adds new windows (copying last configuration) → removes windows as needed
2. **Configuration Flow**: User configures each window independently (model, prompts, parameters, variables, tools)
3. **Execution Flow**: User executes individual windows OR executes all windows in parallel
4. **Comparison Flow**: User reviews results side-by-side within each window for immediate comparison

### System Architecture

```
MultiPlaygroundProvider (Top Level)
├── WindowManager (Add/Remove Controls)
├── GlobalExecutionControls (Run All, Stop All)
└── PlaygroundWindowContainer (Horizontal Scrollable)
    ├── PlaygroundWindow 1 (PlaygroundProvider)
    │   ├── Messages Component
    │   ├── GenerationOutput Component
    │   ├── ModelParameters Component
    │   ├── Variables Component
    │   ├── PlaygroundTools Component
    │   └── Individual Controls (Submit, Stop)
    ├── PlaygroundWindow 2 (PlaygroundProvider)
    └── PlaygroundWindow N (PlaygroundProvider)
```

## 2. Project Structure

### New Files to Create

```
web/src/features/playground/page/
├── components/
│   ├── MultiPlayground.tsx               # Main multi-window container
│   ├── MultiPlaygroundProvider.tsx       # Top-level state management
│   ├── WindowManager.tsx                 # Add/remove window controls
│   ├── GlobalExecutionControls.tsx       # Run All/Stop All buttons
│   ├── PlaygroundWindowContainer.tsx     # Scrollable window container
│   ├── PlaygroundWindow.tsx              # Individual window wrapper
│   └── WindowCloseButton.tsx             # Individual window close button
└── hooks/
    ├── useMultiPlayground.tsx             # Multi-window state hook
    ├── useWindowExecution.tsx             # Individual window execution
    └── useParallelExecution.tsx           # Parallel execution coordinator
```

### Files to Modify

```
web/src/features/playground/page/
├── index.tsx                             # Wrap with MultiPlaygroundProvider
├── playground.tsx                        # Refactor for single window use
├── context/index.tsx                     # Make reusable for individual windows
└── components/
    ├── Messages.tsx                      # Remove global controls, add window-specific
    └── ResetPlaygroundButton.tsx         # Update for multi-window context
```

## 3. Feature Specification

### 3.1 Multi-Window Management

**User Story**: As a user, I want to dynamically add and remove playground windows to test different configurations side-by-side.

**Implementation Steps**:

1. Create `MultiPlaygroundProvider` to manage array of window configurations
2. Implement `addWindow()` function that copies last created window's state
3. Implement `removeWindow(windowId)` function with confirmation
4. Create `WindowManager` component with "Add Window" button
5. Add close button (X) to each window header
6. Handle edge case of removing last window (prevent)

**Error Handling**:

- Prevent removing the last remaining window
- Handle memory cleanup when windows are removed
- Graceful handling of execution interruption on window removal

### 3.2 Responsive Layout System

**User Story**: As a user, I want windows to be evenly distributed and scrollable horizontally on desktop, and stacked vertically on mobile.

**Implementation Steps**:

1. Create CSS Grid layout for equal-width distribution
2. Calculate dynamic window width: `max(320px, 100vw / windowCount)`
3. Implement horizontal scrolling when total width exceeds viewport
4. Add responsive breakpoints for mobile/tablet stacking
5. Ensure smooth scroll behavior with CSS `scroll-behavior: smooth`

**CSS Implementation**:

```css
.playground-container {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(320px, 1fr);
  gap: 1rem;
  overflow-x: auto;
  scroll-behavior: smooth;
}

@media (max-width: 768px) {
  .playground-container {
    grid-auto-flow: row;
    grid-auto-columns: unset;
    overflow-x: visible;
  }
}
```

### 3.3 Independent Window Execution

**User Story**: As a user, I want to execute each window independently to test specific configurations.

**Implementation Steps**:

1. Maintain individual `PlaygroundProvider` per window
2. Add individual Submit/Stop buttons to each window
3. Implement window-specific execution state (loading, success, error)
4. Use `AbortController` for individual stop functionality
5. Display execution results within each window

**State Interface**:

```typescript
interface WindowExecutionState {
  isExecuting: boolean;
  hasError: boolean;
  errorMessage?: string;
  abortController?: AbortController;
}
```

### 3.4 Parallel Execution System

**User Story**: As a user, I want to execute all windows simultaneously to quickly compare results across configurations.

**Implementation Steps**:

1. Create `useParallelExecution` hook to coordinate multiple executions
2. Implement global "Run All" button that triggers all windows
3. Implement global "Stop All" button using `AbortController.abort()`
4. Show global execution status (e.g., "Running 3 of 5 windows")
5. Handle individual window failures without stopping others

**Parallel Execution Logic**:

```typescript
const executeAllWindows = async () => {
  const promises = windows.map((window) =>
    window.playgroundProvider.handleSubmit(),
  );

  try {
    await Promise.allSettled(promises);
  } catch (error) {
    // Handle global execution errors
  }
};
```

### 3.5 State Isolation

**User Story**: As a user, I want each window to maintain completely independent configurations without affecting other windows.

**Implementation Steps**:

1. Wrap each window in its own `PlaygroundProvider`
2. Ensure no shared state between providers
3. Implement deep copying for window duplication
4. Prevent variable name conflicts between windows
5. Maintain separate execution contexts

## 4. Database Schema

**Note**: No database changes required - this is a frontend-only enhancement.

## 5. Server Actions

**Note**: No server-side changes required - existing playground API endpoints will be reused.

### 5.1 Existing API Endpoints Used

- `getChatCompletion*` functions for LLM execution
- Model and provider configuration endpoints
- Tool and schema management endpoints

## 6. Design System

### 6.1 Visual Style

**Color Palette**:

- Window borders: `hsl(var(--border))` (existing design token)
- Window backgrounds: `hsl(var(--background))` (existing design token)
- Active states: `hsl(var(--primary))` (existing design token)
- Error states: `hsl(var(--destructive))` (existing design token)

**Typography**:

- Uses existing Shadcn/UI typography scale
- Window headers: `font-semibold text-sm`
- Button labels: `text-sm font-medium`

**Spacing**:

- Window gap: `1rem` (16px)
- Internal padding: `1rem` (16px)
- Minimum window width: `320px`

### 6.2 Core Components

**Window Layout Structure**:

```tsx
<div className="playground-window border rounded-lg bg-background">
  <div className="window-header flex justify-between items-center p-4 border-b">
    <div className="execution-controls">
      <Button>Submit</Button>
      <Button variant="outline">Stop</Button>
    </div>
    <Button variant="ghost" size="icon">
      <X className="h-4 w-4" />
    </Button>
  </div>
  <div className="window-content p-4">{/* Existing playground content */}</div>
</div>
```

## 7. Component Architecture

### 7.1 Server Components

**Note**: All components are client-side React components due to interactive nature.

### 7.2 Client Components

#### MultiPlaygroundProvider

```typescript
interface MultiPlaygroundContextType {
  windows: PlaygroundWindowConfig[];
  addWindow: () => void;
  removeWindow: (windowId: string) => void;
  executeAllWindows: () => Promise<void>;
  stopAllWindows: () => void;
  isGlobalExecution: boolean;
}

interface PlaygroundWindowConfig {
  id: string;
  playgroundState: PlaygroundCache;
  executionState: WindowExecutionState;
}
```

#### PlaygroundWindow

```typescript
interface PlaygroundWindowProps {
  windowId: string;
  initialState: PlaygroundCache;
  onRemove: (windowId: string) => void;
  isGlobalExecution: boolean;
}
```

#### WindowManager

```typescript
interface WindowManagerProps {
  onAddWindow: () => void;
  windowCount: number;
}
```

#### GlobalExecutionControls

```typescript
interface GlobalExecutionControlsProps {
  onExecuteAll: () => Promise<void>;
  onStopAll: () => void;
  isExecuting: boolean;
  executionStatus: string;
}
```

## 8. Authentication & Authorization

**Note**: Uses existing Langfuse authentication system - no changes required.

## 9. Data Flow

### State Management Architecture

```
MultiPlaygroundProvider
├── windows: PlaygroundWindowConfig[]
├── globalExecutionState: GlobalExecutionState
└── windowActions: { add, remove, executeAll, stopAll }

Individual PlaygroundProvider (per window)
├── messages: ChatMessageWithId[]
├── modelParams: UIModelParams
├── variables: PromptVariable[]
├── tools: PlaygroundTool[]
├── executionState: { output, isStreaming, etc. }
└── playgroundActions: { handleSubmit, updateMessage, etc. }
```

### Data Flow Patterns

1. **Window Creation**: MultiPlaygroundProvider → creates new PlaygroundProvider → copies last window state
2. **Individual Execution**: PlaygroundWindow → PlaygroundProvider.handleSubmit() → API call → update window state
3. **Parallel Execution**: GlobalExecutionControls → MultiPlaygroundProvider.executeAll() → Promise.allSettled() → update all window states
4. **Window Removal**: PlaygroundWindow.onClose → MultiPlaygroundProvider.removeWindow() → cleanup state

## 10. Testing

### 10.1 Unit Tests with Jest

**Key Test Cases**:

```typescript
// MultiPlaygroundProvider Tests
describe("MultiPlaygroundProvider", () => {
  test("should add new window with copied configuration", () => {
    // Test window addition logic
  });

  test("should remove window and cleanup state", () => {
    // Test window removal logic
  });

  test("should prevent removing last window", () => {
    // Test edge case handling
  });
});

// Parallel Execution Tests
describe("useParallelExecution", () => {
  test("should execute all windows in parallel", () => {
    // Test parallel execution coordination
  });

  test("should handle individual window failures gracefully", () => {
    // Test error handling in parallel execution
  });

  test("should stop all executions when requested", () => {
    // Test abort controller functionality
  });
});

// Layout Tests
describe("PlaygroundWindowContainer", () => {
  test("should distribute windows equally within viewport", () => {
    // Test responsive layout calculation
  });

  test("should enable horizontal scrolling when needed", () => {
    // Test overflow behavior
  });

  test("should stack vertically on mobile", () => {
    // Test responsive behavior
  });
});
```
