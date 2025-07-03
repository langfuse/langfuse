# Multi-Window Playground Implementation Plan

## Phase 1: Core Architecture Setup

- [ ] **Step 1.1**: Analyze current playground implementation

  - **Task**: Examine the existing playground architecture to understand the current state management, hooks, and component structure. Document the current implementation patterns and identify all files that need modification.
  - **Files**:
    - `web/src/features/playground/page/index.tsx`: Review current page structure
    - `web/src/features/playground/page/context/index.tsx`: Analyze PlaygroundProvider implementation
    - `web/src/features/playground/page/hooks/usePlaygroundCache.ts`: Examine cache management
    - `web/src/features/playground/page/hooks/useModelParams.ts`: Study model parameter handling
    - `web/src/features/playground/page/playground.tsx`: Review main playground component
  - **Step Dependencies**: None
  - **User Instructions**: None

- [x] **Step 1.2**: Create core multi-window types and interfaces

  - **Task**: Define TypeScript interfaces for the multi-window system including PlaygroundHandle, WindowCoordinationReturn, and updated PlaygroundProvider props. Create type definitions for window coordination and global state management.
  - **Files**:
    - `web/src/features/playground/page/types.ts`: Add multi-window interfaces
  - **Step Dependencies**: Step 1.1
  - **User Instructions**: None

- [x] **Step 1.3**: Create global coordination hook
  - **Task**: Implement `useWindowCoordination` hook that manages the global window registry and event bus system. This hook will handle window registration, unregistration, and coordination of global actions like "Run All" and "Stop All".
  - **Files**:
    - `web/src/features/playground/page/hooks/useWindowCoordination.ts`: Create coordination hook
  - **Step Dependencies**: Step 1.2
  - **User Instructions**: None

## Phase 2: State Isolation Implementation

- [x] **Step 2.1**: Modify playground cache hook for window isolation

  - **Task**: Update `usePlaygroundCache` to accept an optional `windowId` parameter and modify the cache key to be window-specific. Ensure backward compatibility with existing single-window usage.
  - **Files**:
    - `web/src/features/playground/page/hooks/usePlaygroundCache.ts`: Add windowId parameter and update cache key logic
  - **Step Dependencies**: Step 1.2
  - **User Instructions**: None

- [x] **Step 2.2**: Modify model parameters hook for window isolation

  - **Task**: Update `useModelParams` to accept an optional `windowId` parameter and modify localStorage keys to be window-specific. Update all model parameter persistence logic to use window-specific keys.
  - **Files**:
    - `web/src/features/playground/page/hooks/useModelParams.ts`: Add windowId parameter and update localStorage keys
  - **Step Dependencies**: Step 1.2
  - **User Instructions**: None

- [x] **Step 2.3**: Update PlaygroundProvider for window support
  - **Task**: Modify `PlaygroundProvider` to accept an optional `windowId` prop and pass it to the modified hooks. Implement window self-registration logic for global coordination. Ensure all existing functionality remains intact.
  - **Files**:
    - `web/src/features/playground/page/context/index.tsx`: Add windowId prop and self-registration logic
  - **Step Dependencies**: Step 2.1, Step 2.2, Step 1.3
  - **User Instructions**: None

## Phase 3: Multi-Window Container Implementation

- [x] **Step 3.1**: Create multi-window playground container

  - **Task**: Create `MultiWindowPlayground` component that manages an array of windows, provides global controls (Run All, Stop All, Add Window), and implements the responsive layout system. Include window management logic and horizontal scrolling.
  - **Files**:
    - `web/src/features/playground/page/components/MultiWindowPlayground.tsx`: Create main multi-window container
  - **Step Dependencies**: Step 2.3
  - **User Instructions**: None

- [x] **Step 3.2**: Create individual playground window component
  - **Task**: Create `PlaygroundWindow` component that wraps a single playground instance with window-specific controls (close button, individual submit/stop buttons) and provides the isolated PlaygroundProvider context.
  - **Files**:
    - `web/src/features/playground/page/components/PlaygroundWindow.tsx`: Create individual window wrapper
  - **Step Dependencies**: Step 3.1
  - **User Instructions**: None

## Phase 4: UI Layout and Styling

- [x] **Step 4.1**: Implement responsive layout CSS

  - **Task**: Create CSS classes for the multi-window layout system including CSS Grid for equal-width distribution, horizontal scrolling, mobile responsiveness, and proper window spacing. Use existing design tokens and Tailwind classes.
  - **Files**:
    - `web/src/features/playground/page/components/MultiWindowPlayground.tsx`: Add CSS classes and responsive styling
  - **Step Dependencies**: Step 3.2
  - **User Instructions**: None

- [x] **Step 4.2**: Create window header and controls

  - **Task**: Design and implement window headers with close buttons, window identification, and individual action buttons. Style using existing Shadcn/UI components and design system patterns.
  - **Files**:
    - `web/src/features/playground/page/components/PlaygroundWindow.tsx`: Add window header and styling
  - **Step Dependencies**: Step 4.1
  - **User Instructions**: None

- [x] **Step 4.3**: Implement global controls header
  - **Task**: Create global controls section with "Add Window", "Run All", and "Stop All" buttons. Position appropriately in the layout and style consistently with existing playground controls.
  - **Files**:
    - `web/src/features/playground/page/components/MultiWindowPlayground.tsx`: Add global controls header
  - **Step Dependencies**: Step 4.2
  - **User Instructions**: None

## Phase 5: Integration and Page Updates

- [x] **Step 5.1**: Update playground page to use multi-window system

  - **Task**: Modify the main playground page to use `MultiWindowPlayground` instead of the single playground. Ensure all existing functionality (save to prompt, reset playground) continues to work with the new architecture.
  - **Files**:
    - `web/src/features/playground/page/index.tsx`: Replace single playground with multi-window version
  - **Step Dependencies**: Step 4.3
  - **User Instructions**: None

- [x] **Step 5.2**: Update existing playground components for multi-window compatibility
  - **Task**: Review and update existing playground components (SaveToPromptButton, ResetPlaygroundButton, etc.) to work correctly with the multi-window system. Ensure they don't interfere with window-specific state.
  - **Files**:
    - `web/src/features/playground/page/components/SaveToPromptButton.tsx`: Updated for multi-window compatibility
    - `web/src/features/playground/page/components/ResetPlaygroundButton.tsx`: Updated for multi-window compatibility
    - `web/src/features/playground/page/components/JumpToPlaygroundButton.tsx`: Updated for multi-window compatibility
    - `web/src/features/playground/page/hooks/usePersistedWindowIds.ts`: Enhanced to support JumpToPlaygroundButton compatibility
    - `web/src/__tests__/playground/multi-window-compatibility.test.tsx`: Added comprehensive tests for multi-window compatibility
  - **Step Dependencies**: Step 5.1
  - **User Instructions**: None

## Phase 6: Feature Enhancements

- [ ] **Step 6.1**: Implement window copying on add

  - **Task**: When adding a new window, copy the configuration from the most recently created window. Implement deep cloning of all playground state including messages, model parameters, variables, tools, and structured output schemas.
  - **Files**:
    - `web/src/features/playground/page/components/MultiWindowPlayground.tsx`: Add window copying logic
  - **Step Dependencies**: Step 5.2
  - **User Instructions**: None

- [ ] **Step 6.2**: Implement parallel execution coordination

  - **Task**: Enhance the global coordination system to handle parallel execution of multiple windows. Implement proper loading states, error handling, and execution status tracking for all windows.
  - **Files**:
    - `web/src/features/playground/page/hooks/useWindowCoordination.ts`: Add parallel execution logic
    - `web/src/features/playground/page/components/MultiWindowPlayground.tsx`: Add execution status display
  - **Step Dependencies**: Step 6.1
  - **User Instructions**: None

- [ ] **Step 6.3**: Add window limit and validation
  - **Task**: Implement the 10-window limit, prevent removal of the last window, and add proper validation and error handling for window management operations.
  - **Files**:
    - `web/src/features/playground/page/components/MultiWindowPlayground.tsx`: Add window limit and validation
  - **Step Dependencies**: Step 6.2
  - **User Instructions**: None

## Phase 7: Polish and Optimization

- [ ] **Step 7.1**: Optimize performance and memory usage

  - **Task**: Review the implementation for performance optimizations, implement proper cleanup for removed windows, optimize re-renders, and ensure efficient memory usage with multiple playground instances.
  - **Files**:
    - `web/src/features/playground/page/context/index.tsx`: Add cleanup and optimization
    - `web/src/features/playground/page/hooks/useWindowCoordination.ts`: Optimize registry management
  - **Step Dependencies**: Step 6.3
  - **User Instructions**: None

- [ ] **Step 7.2**: Add error handling and edge cases
  - **Task**: Implement comprehensive error handling for window operations, API failures, and edge cases like network interruptions during parallel execution. Add proper error messaging and recovery mechanisms.
  - **Files**:
    - `web/src/features/playground/page/components/MultiWindowPlayground.tsx`: Add error handling
    - `web/src/features/playground/page/components/PlaygroundWindow.tsx`: Add error handling
  - **Step Dependencies**: Step 7.1
  - **User Instructions**: None

## Phase 8: Testing and Validation

- [ ] **Step 8.1**: Create unit tests for multi-window functionality

  - **Task**: Write comprehensive unit tests for the new multi-window functionality including window coordination, state isolation, cache management, and global actions. Test edge cases and error scenarios.
  - **Files**:
    - `web/src/__tests__/playground/multi-window.test.tsx`: Create multi-window tests
    - `web/src/__tests__/playground/window-coordination.test.tsx`: Create coordination tests
    - `web/src/__tests__/playground/cache-isolation.test.tsx`: Create cache isolation tests
  - **Step Dependencies**: Step 7.2
  - **User Instructions**: None

- [ ] **Step 8.2**: Test responsive layout and mobile compatibility

  - **Task**: Validate that the responsive layout works correctly across different screen sizes, test mobile stacking behavior, and ensure accessibility standards are met.
  - **Files**:
    - `web/src/__tests__/playground/responsive-layout.test.tsx`: Create responsive layout tests
  - **Step Dependencies**: Step 8.1
  - **User Instructions**: Test the implementation on various devices and screen sizes to ensure the responsive design works correctly.

- [ ] **Step 8.3**: Integration testing and final validation
  - **Task**: Perform end-to-end testing of the complete multi-window playground functionality. Test complex scenarios like parallel execution, window management, and state persistence across browser sessions.
  - **Files**:
    - `web/src/__tests__/playground/integration.test.tsx`: Create integration tests
  - **Step Dependencies**: Step 8.2
  - **User Instructions**: Thoroughly test all functionality including: creating/removing windows, configuring different models per window, parallel execution, state persistence, and responsive behavior.

## Summary

This implementation plan takes a phased approach to building the multi-window playground enhancement:

1. **Phase 1-2**: Establishes the core architecture and state isolation without breaking existing functionality
2. **Phase 3-4**: Builds the multi-window UI components and responsive layout system
3. **Phase 5-6**: Integrates everything together and adds advanced features like window copying and parallel execution
4. **Phase 7-8**: Polishes the implementation with optimizations, error handling, and comprehensive testing

The plan ensures that each step builds upon the previous ones and maintains backward compatibility with the existing single-window playground functionality. The implementation is designed to be modular and maintainable, following the existing codebase patterns and design system.

Key architectural decisions:

- **Compositional approach**: Wrapping existing components rather than rebuilding them
- **State isolation**: Each window maintains completely independent state through window-specific cache and localStorage keys
- **Global coordination**: Using an event bus system and registry for coordinating actions across windows
- **Responsive design**: CSS Grid with horizontal scrolling for optimal layout across devices
- **Performance optimization**: Efficient memory usage and cleanup for multiple playground instances
