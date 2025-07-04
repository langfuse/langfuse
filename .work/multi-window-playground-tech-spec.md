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
MultiWindowPlayground (Container Component)
├── Global Controls (Run All, Stop All, Add Window)
├── Window Container (Horizontal Scrollable)
│   ├── PlaygroundWindow 1 (PlaygroundProvider windowId="abc")
│   │   └── Playground (existing component)
│   ├── PlaygroundWindow 2 (PlaygroundProvider windowId="def")
│   │   └── Playground (existing component)
│   └── PlaygroundWindow N (PlaygroundProvider windowId="xyz")
│       └── Playground (existing component)
└── Global Coordination
    ├── globalWindowRegistry (Map<windowId, PlaygroundHandle>)
    └── globalEventBus (EventTarget for coordination)
```

## 2. Project Structure

### New Files to Create

```
web/src/features/playground/page/
├── components/
│   └── MultiWindowPlayground.tsx           # Main multi-window container
└── hooks/
    └── useWindowCoordination.ts             # Global coordination hook
```

### Files to Modify

```
web/src/features/playground/page/
├── index.tsx                               # Use MultiWindowPlayground instead of single
├── hooks/
│   ├── usePlaygroundCache.ts               # Add windowId parameter
│   └── useModelParams.ts                   # Add windowId parameter
└── context/index.tsx                       # Add windowId prop and self-registration
```

## 3. Feature Specification

### 3.1 Multi-Window Management

**User Story**: As a user, I want to dynamically add and remove playground windows to test different configurations side-by-side.

**Implementation Steps**:

1. Create `MultiWindowPlayground` container component to manage window array
2. Implement `addWindow()` function that generates new windowId
3. Implement `removeWindow(windowId)` function with last-window prevention
4. Add close button (X) to each window header
5. Handle cleanup when windows are removed

**Error Handling**:

- Prevent removing the last remaining window
- Clean up global registry when windows are removed
- Graceful handling of execution interruption on window removal

### 3.2 Window State Isolation

**User Story**: As a user, I want each window to maintain completely independent configurations without affecting other windows.

**Implementation Steps**:

1. Modify `usePlaygroundCache` to accept `windowId` parameter
2. Update cache keys to be window-specific: `playgroundCache_${windowId}`
3. Modify `useModelParams` to accept `windowId` parameter
4. Update localStorage keys to be window-specific: `llmModelName_${windowId}`
5. Pass `windowId` through `PlaygroundProvider` props

**Cache Isolation**:

```typescript
// Before: Shared cache key
const playgroundCacheKey = "playgroundCache";

// After: Window-specific cache key
export default function usePlaygroundCache(windowId: string = "default") {
  const playgroundCacheKey = `playgroundCache_${windowId}`;
  // ... rest unchanged
}
```

### 3.3 Global Coordination System

**User Story**: As a user, I want to execute all windows simultaneously to quickly compare results across configurations.

**Implementation Steps**:

1. Create global window registry using `Map<string, PlaygroundHandle>`
2. Create global event bus using `EventTarget`
3. Each window self-registers on mount and unregisters on unmount
4. Implement global "Run All" using event bus dispatch
5. Implement global "Stop All" using registry iteration

**Global Coordination Logic**:

```typescript
// Global registry - no React state
const globalWindowRegistry = new Map<string, PlaygroundHandle>();
const globalEventBus = new EventTarget();

// Each window self-registers
useEffect(() => {
  globalWindowRegistry.set(windowId, { handleSubmit, stopExecution });
  globalEventBus.addEventListener("execute-all", handleGlobalExecute);

  return () => {
    globalWindowRegistry.delete(windowId);
    globalEventBus.removeEventListener("execute-all", handleGlobalExecute);
  };
}, [windowId, handleSubmit]);

// Global actions don't cause re-renders
const executeAll = () =>
  globalEventBus.dispatchEvent(new CustomEvent("execute-all"));
```

### 3.4 Responsive Layout System

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
<div className="playground-window border rounded-lg bg-background min-w-[320px] flex-1">
  <div className="window-header flex justify-between items-center p-3 border-b bg-muted/50">
    <div className="text-sm font-medium text-muted-foreground">
      Window {windowId.slice(-4)}
    </div>
    <Button variant="ghost" size="sm" onClick={onRemove}>
      <X className="h-3 w-3" />
    </Button>
  </div>
  <div className="window-content">
    <PlaygroundProvider windowId={windowId}>
      <Playground />
    </PlaygroundProvider>
  </div>
</div>
```

## 7. Component Architecture

### 7.1 Core Interfaces

#### PlaygroundHandle

```typescript
interface PlaygroundHandle {
  handleSubmit: (streaming?: boolean) => Promise<void>;
  stopExecution: () => void;
  isStreaming: boolean;
}
```

#### PlaygroundProvider Props

```typescript
interface PlaygroundProviderProps {
  children: React.ReactNode;
  windowId?: string;
}
```

#### MultiWindowPlayground State

```typescript
interface MultiWindowState {
  windowIds: string[];
  isExecutingAll: boolean;
}
```

### 7.2 Hook Interfaces

#### useWindowCoordination

```typescript
interface WindowCoordinationReturn {
  registerWindow: (windowId: string, handle: PlaygroundHandle) => void;
  unregisterWindow: (windowId: string) => void;
  executeAllWindows: () => void;
  stopAllWindows: () => void;
  getExecutionStatus: () => string | null;
  isExecutingAll: boolean;
}
```

#### usePlaygroundCache

```typescript
// Updated signature
export default function usePlaygroundCache(windowId?: string): {
  playgroundCache: PlaygroundCache;
  setPlaygroundCache: (cache: PlaygroundCache) => void;
};
```

#### useModelParams

```typescript
// Updated signature
export const useModelParams = (windowId?: string): {
  modelParams: UIModelParams;
  setModelParams: React.Dispatch<React.SetStateAction<UIModelParams>>;
  availableProviders: string[];
  availableModels: string[];
  updateModelParamValue: (key: string, value: any) => void;
  setModelParamEnabled: (key: string, enabled: boolean) => void;
}
```

## 8. Authentication & Authorization

**Note**: Uses existing Langfuse authentication system - no changes required.

## 9. Data Flow

### State Management Architecture

```
MultiWindowPlayground (Container - No State Provider)
├── windowIds: string[] (local state)
├── Global Registry: Map<windowId, PlaygroundHandle>
└── Global Event Bus: EventTarget

Individual PlaygroundProvider (per window - windowId prop)
├── Isolated Cache: playgroundCache_${windowId}
├── Isolated Preferences: llmModelName_${windowId}
├── Independent State: messages, variables, tools, etc.
└── Self-Registration: registers with global registry
```

### Data Flow Patterns

1. **Window Creation**: MultiWindowPlayground → generates windowId → creates PlaygroundProvider with windowId
2. **Individual Execution**: PlaygroundProvider → handleSubmit() → API call → update isolated state
3. **Global Execution**: Global Controls → dispatch 'execute-all' event → all windows execute independently
4. **Window Removal**: MultiWindowPlayground → removes windowId → PlaygroundProvider unmounts → auto-cleanup

## 10. Testing

### 10.1 Unit Tests with Jest

**Key Test Cases**:

```typescript
// Global Coordination Tests
describe("Global Window Coordination", () => {
  test("should register and unregister windows correctly", () => {
    // Test global registry management
  });

  test("should execute all windows when execute-all event is dispatched", () => {
    // Test event bus coordination
  });

  test("should stop all windows when requested", () => {
    // Test global stop functionality
  });
});

// Cache Isolation Tests
describe("Window Cache Isolation", () => {
  test("should create separate cache keys for different windows", () => {
    // Test cache key generation
  });

  test("should not interfere with other window caches", () => {
    // Test cache isolation
  });
});

// Model Preferences Isolation Tests
describe("Model Preferences Isolation", () => {
  test("should create separate localStorage keys for different windows", () => {
    // Test localStorage key generation
  });

  test("should maintain independent model selections", () => {
    // Test model preference isolation
  });
});
```
