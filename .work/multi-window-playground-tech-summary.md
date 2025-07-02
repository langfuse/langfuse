# Multi-Window Playground Architecture Proposal

## Executive Summary

**Recommendation**: Implement multi-window playground functionality using a **Minimal Wrapper Pattern with Global Coordination** approach. This solution requires minimal code changes (~60 lines total), maintains existing functionality, and provides complete state isolation between windows as required.

## Project Requirements

- Support multiple side-by-side playground windows (up to 10)
- Independent configuration per window (models, prompts, parameters, variables)
- Individual and parallel execution capabilities
- Complete state isolation between windows
- Horizontal scrolling layout with responsive design
- No persistence beyond session storage (no save/export functionality)

## Architecture Analysis

### Current Single-Window Architecture

- **Structure**: Single `PlaygroundProvider` context managing ~15 pieces of state
- **Components**: Heavy context provider (745 lines) consumed by layout and UI components
- **Cache**: Single sessionStorage key for state persistence
- **Strengths**: Battle-tested, comprehensive state management, proven reliability

### Solutions Evaluated

#### 1. Multi-Provider Approach (Original Tech Spec)

- **Concept**: Each window gets its own `PlaygroundProvider` instance
- **Problems Identified**:
  - Cache key conflicts (all windows overwrite same sessionStorage key)
  - Complex coordination for "Run All" functionality
  - Memory overhead of multiple heavy providers
  - Performance concerns with multiple hook instances

#### 2. Refactored Single Provider

- **Concept**: One provider managing `Map<windowId, WindowState>`
- **Critical Issues**:
  - Massive re-render problem (any window change re-renders ALL windows)
  - High complexity refactor of 745-line provider (high risk)
  - Loss of React's built-in context optimizations
  - Performance degradation with multiple windows

#### 3. Zustand/External State Management

- **Concept**: Replace React Context with external state library
- **Drawbacks**:
  - Major architectural change requiring extensive refactoring
  - Learning curve for team
  - Over-engineering for the requirements

## Recommended Solution: Minimal Wrapper Pattern

### Core Architecture

```
MultiWindowPlayground
├── Global Controls (Run All, Stop All, Add Window)
├── Window 1: PlaygroundProvider(windowId="abc") → Playground
├── Window 2: PlaygroundProvider(windowId="def") → Playground
└── Window N: PlaygroundProvider(windowId="xyz") → Playground

Coordination: Global Event Bus + Window Registry (no parent state)
```

### Key Design Principles

1. **Embrace existing architecture** - Don't fight the current `PlaygroundProvider`
2. **Solve specific problems only** - Cache isolation and coordination
3. **Minimize code changes** - Reduce implementation risk
4. **Maintain performance** - True window isolation prevents cross-window re-renders

### Implementation Details

#### 1. Cache Isolation (5 lines changed)

```typescript
// Before: Hard-coded cache key
const playgroundCacheKey = "playgroundCache";

// After: Window-specific cache key
export default function usePlaygroundCache(windowId: string = "default") {
  const playgroundCacheKey = `playgroundCache_${windowId}`;
  // ... rest unchanged
}
```

#### 2. Model Preference Isolation (10 lines changed)

```typescript
// Before: Shared localStorage keys
const [persistedModelName] = useLocalStorage("llmModelName", null);

// After: Window-specific localStorage keys
export const useModelParams = (windowId: string = "default") => {
  const [persistedModelName] = useLocalStorage(
    `llmModelName_${windowId}`,
    null,
  );
  const [persistedModelProvider] = useLocalStorage(
    `llmModelProvider_${windowId}`,
    null,
  );
  // ... rest unchanged
};
```

#### 3. Global Coordination (50 lines new)

```typescript
// Decentralized coordination without parent re-renders
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

### Benefits Analysis

#### Technical Benefits

- ✅ **True state isolation**: No cross-window interference or re-renders
- ✅ **Minimal risk**: Existing code 95% unchanged
- ✅ **Performance**: Each window completely independent
- ✅ **Maintainability**: Simple, understandable patterns
- ✅ **Testability**: Easy to test individual windows

#### Business Benefits

- ✅ **Fast implementation**: ~1-2 days vs weeks for alternatives
- ✅ **Low risk**: Minimal changes to battle-tested code
- ✅ **Backward compatible**: Single-window functionality unchanged
- ✅ **Future-proof**: Easy to extend or modify

## Implementation Plan

### Phase 1: Core Infrastructure (Day 1)

1. Update `usePlaygroundCache.ts` (5 lines)
2. Update `useModelParams.ts` (10 lines)
3. Create `useWindowCoordination.ts` (50 lines)

### Phase 2: UI Components (Day 2)

1. Create `MultiWindowPlayground.tsx` (100 lines)
2. Update main playground page (5 lines)
3. Add responsive CSS (20 lines)

### Total Implementation: ~190 lines added, ~15 lines modified

## Risk Assessment

| Risk                           | Mitigation                                          |
| ------------------------------ | --------------------------------------------------- |
| Multiple provider memory usage | Minimal - providers are lightweight when isolated   |
| Coordination complexity        | Simple global registry pattern, well-tested         |
| Browser localStorage limits    | Window-specific keys use minimal additional storage |
| Backward compatibility         | Default parameters maintain single-window behavior  |

## Alternative Approaches Rejected

1. **Single Provider Refactor**: High risk, performance issues, complex implementation
2. **External State Management**: Over-engineering, large architectural change
3. **Portal-based Approaches**: Unusual patterns, maintenance burden

## Conclusion

The **Minimal Wrapper Pattern** leverages React's component architecture naturally while solving only the specific multi-window problems. It provides a robust, performant solution with minimal implementation risk and maintains the reliability of the existing codebase.

**Recommendation**: Proceed with this approach for fastest, lowest-risk implementation that meets all requirements.
