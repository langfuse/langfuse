# Multi-Window LLM Playground Enhancement

## Project Description

Extend the existing Langfuse playground to support multiple side-by-side prompt windows, enabling rapid iteration and comparison of different LLM configurations. Users can dynamically add/remove windows, test different combinations of models, prompts, parameters, and variables, and execute experiments individually or in parallel.

## Target Audience

- AI engineers and researchers iterating on prompts
- Product teams A/B testing different LLM approaches
- Developers comparing model performance across configurations
- Anyone needing to quickly test prompt variations side-by-side

## Desired Features

### Window Management

- [ ] Start with single window by default
- [ ] Dynamically add new windows (copies last created window's configuration)
- [ ] Delete individual windows with close button (X)
- [ ] Configurable window limit (10)
- [ ] Equal-width distribution up to 320px minimum width
- [ ] Horizontal scrolling when windows exceed screen capacity
- [ ] Responsive layout (vertical stacking on mobile/tablet)
- [ ] No window naming or identification needed

### Execution Control

- [ ] Execute individual windows independently
- [ ] Execute all windows in parallel simultaneously
- [ ] Individual submit buttons per window
- [ ] Individual stop buttons per window
- [ ] Global "Run All" button for parallel execution
- [ ] Global "Stop All" button to halt all running executions
- [ ] Stop buttons are no-op for completed executions
- [ ] Execution status indicators per window (loading/success/error)

### Configuration Flexibility

- [ ] Independent model selection per window
- [ ] Separate prompt messages per window
- [ ] Individual parameter settings (top-p, temperature, etc.) per window
- [ ] Window-specific variables and variable values (no global variables)
- [ ] Tool configurations per window
- [ ] Structured output schemas per window
- [ ] Complete state isolation between windows

### State Management

- [ ] Refactor existing React context for multi-window architecture
- [ ] Independent PlaygroundProvider per window
- [ ] Session persistence in cache same as single window playground
- [ ] No save/export functionality required

### Results Display

- [ ] Execution results displayed within each window
- [ ] Same view integration (config + execution in same window)
- [ ] No separate comparison views needed

## Design Requests

- [ ] Side-by-side layout with horizontal scrolling
  - [ ] Equal-width windows distributed across available screen width
  - [ ] 320px minimum window width before horizontal scrolling
  - [ ] Smooth horizontal scroll behavior
- [ ] Clear visual separation between windows
  - [ ] Simple close buttons (X) in window corners
  - [ ] Distinct borders or subtle background differences between windows
- [ ] Execution control layout
  - [ ] Individual submit/stop buttons clearly visible per window
  - [ ] Global "Run All" and "Stop All" buttons in header area
  - [ ] Loading states and status indicators per window
- [ ] Responsive behavior
  - [ ] Horizontal layout on desktop/tablet
  - [ ] Vertical stacking on mobile devices

## Other Notes

- Frontend-only enhancement, no backend functionality
- Must extend existing playground architecture, not rebuild
- Current React context needs architectural changes for multi-window support
- All variables and configurations are window-specific
- Performance considerations for multiple parallel LLM calls
- No data persistence, naming, or save functionality required
- Windows are UI elements for comparison, not true application windows
