# QueryInput

Controlled query editor. Owns contenteditable selection, IME handling, undo/redo, keyboard navigation, surface styling, token rendering/tooltips, and all suggestion rendering and positioning. It has no dependency on a query language, field registry, or application store.

In `mode="editable"` (the default), callers provide:

- `value`, `onValueChange`, and `onCommit` (canonical text, or `null` on rejection).
- Tokens with text offsets, presentation kinds, explanations, and errors. Optional structured groups/parts describe syntax colors and non-wrapping runs; their text must preserve the original query. QueryInput owns the markup, whitespace wrappers, and caret boundaries. No token JSX crosses this boundary.
- A controller from `useQueryInputController` owns logical selection, suggestion visibility, and explicit highlights. QueryInput mirrors native selection into the controller; controller selection changes do not move the DOM caret.
- `completions`: structured options with labels, sections, details, icon variants, optional colored badges, selection indicators, and complete text/caret edits. The plan also supplies loading state and auto-highlight policy. Callers derive it from the controlled value and controller state, and own all data loading. QueryInput renders the listbox, handles pointer highlights, and scrolls the active option into view; callers supply no suggestion JSX or rendering callbacks. `onApplied` receives the edited query, so consumers need not rely on synchronous React state updates.
- Already-revealed diagnostics and use-case-specific commit/removal behavior.

`SearchComposer` is the Langfuse adapter: it owns AST parsing, field registries, history, lazy value requests, and conversion to `FilterState`. Keep those concerns outside this component. See the standalone stories for a store-free example.

`mode="preview"` renders a bordered read-only input from `value` and `tokens`, with optional `size` and `tone="muted"`. Preview mode mounts no editor hooks and accepts no children, editing callbacks, or diagnostics. Both modes share a private surface backed by `InputControl` and use `QueryTokens` for token rendering. Rich read-only filter displays own their styling, token, tooltip, and fallback content.

Use `QueryTokens` directly for inline read-only content. It inherits typography and layout from its parent, masks query text from session replay, and renders managed spans without adding a wrapper around the token flow.
