

# AdvancedJsonViewer

A high-performance, self-contained JSON viewer component for React with zero external dependencies (except @tanstack/react-virtual and @radix-ui which are already in the project).

## TL;DR for Developers

**What makes this different?**
- Uses a **tree-based architecture** instead of flat arrays for O(log n) operations
- **JIT rendering**: Computes visible rows on-demand via binary search (no pre-flattening)
- **In-place mutations**: Expand/collapse only updates affected path (O(log n) vs O(n))
- **Two-column layout**: Fixed column (line numbers, buttons) + scrollable column (content)
- **Web Worker support**: Offloads tree building for datasets >100K nodes

**Key files to understand:**
1. `utils/treeStructure.ts` - 4-pass tree building algorithm
2. `utils/treeNavigation.ts` - `getNodeByIndex()` O(log n) lookup via childOffsets
3. `utils/treeExpansion.ts` - `toggleNodeExpansion()` with ancestor propagation
4. `hooks/useTreeState.ts` - Orchestrates tree lifecycle
5. `VirtualizedJsonViewer.tsx` - Rendering with TanStack Virtual

**Performance wins:**
- 100K nodes: <200ms render, <10ms expand/collapse
- No re-render on expansion state changes (uses localStorage directly)
- Virtualization renders only ~50 rows regardless of dataset size

**Architecture diagram:**
```
┌─────────────────────────────────────────────────────┐
│ JSON Data                                           │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │ buildTreeFromJSON() - 4 passes    │
    │ 1. Structure  2. Expansion        │
    │ 3. Offsets    4. Width calc       │
    └───────────────┬───────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ TreeState             │
        │ • rootNode (TreeNode) │
        │ • nodeMap (lookup)    │
        │ • allNodes (search)   │
        └───────┬───────────────┘
                │
                ▼
    ┌──────────────────────────────────┐
    │ VirtualizedJsonViewer            │
    │ uses @tanstack/react-virtual     │
    └───────┬──────────────────────────┘
            │
            ▼
    For each visible index (0-50):
    ┌──────────────────────────────────┐
    │ getNodeByIndex(index)            │
    │ → Binary search childOffsets     │
    │ → O(log n) lookup                │
    └───────┬──────────────────────────┘
            │
            ▼
    ┌──────────────────────────────────┐
    │ Render JsonRowFixed +            │
    │        JsonRowScrollable         │
    └──────────────────────────────────┘
```

## Features

✅ **Virtualized Rendering** - Handles 10MB+ JSON files with smooth 60fps scrolling
✅ **Search with Highlighting** - Find and navigate matches with reliable scroll-to
✅ **Expand/Collapse** - Interactive tree navigation with state management
✅ **Type-Aware Styling** - Syntax highlighting for all JSON types
✅ **String Truncation** - Long strings with popover on hover
✅ **Copy to Clipboard** - Per-row copy functionality
✅ **Line Numbers** - Optional line numbers
✅ **Theme Customization** - Light/dark mode with custom themes
✅ **TypeScript First** - Full type safety throughout

## Usage

### Basic Example

```tsx
import { AdvancedJsonViewer } from '@/components/ui/AdvancedJsonViewer';

function MyComponent() {
  const data = {
    users: [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 }
    ]
  };

  return <AdvancedJsonViewer data={data} />;
}
```

### With Search

```tsx
<AdvancedJsonViewer
  data={myData}
  enableSearch={true}
  searchPlaceholder="Search..."
/>
```

### With Controlled Expansion State

```tsx
function MyComponent() {
  const [expansionState, setExpansionState] = useState<Record<string, boolean>>({
    "root.users": true,
    "root.users.0": false,
  });

  return (
    <AdvancedJsonViewer
      data={myData}
      expansionState={expansionState}
      onExpansionChange={setExpansionState}
    />
  );
}
```

### With Custom Theme

```tsx
<AdvancedJsonViewer
  data={myData}
  theme={{
    numberColor: "#0ea5e9",
    stringColor: "#10b981",
    keyColor: "#f59e0b",
  }}
/>
```

### Force Virtualization

```tsx
<AdvancedJsonViewer
  data={myData}
  virtualized={true} // Force virtualization even for small data
/>
```

## Props

### AdvancedJsonViewerProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `unknown` | **required** | JSON data to display |
| `virtualized` | `boolean` | `auto` | Enable virtualization (auto-detected based on size) |
| `theme` | `PartialJSONTheme` | - | Custom theme overrides |
| `initialExpansion` | `ExpansionState` | `true` | Initial expansion state (boolean or per-path) |
| `expansionState` | `ExpansionState` | - | Controlled expansion state |
| `onExpansionChange` | `(state) => void` | - | Callback when expansion changes |
| `enableSearch` | `boolean` | `true` | Enable search functionality |
| `searchPlaceholder` | `string` | `"Search JSON..."` | Search input placeholder |
| `showLineNumbers` | `boolean` | `false` | Show line numbers |
| `enableCopy` | `boolean` | `true` | Enable copy buttons |
| `truncateStringsAt` | `number \| null` | `100` | Truncate strings longer than this |
| `wrapLongStrings` | `boolean` | `false` | Wrap long strings instead of truncating |
| `className` | `string` | - | Custom CSS class |
| `isLoading` | `boolean` | `false` | Show loading state |
| `error` | `Error \| string` | - | Show error state |

## Types

### ExpansionState

```typescript
type ExpansionState = Record<string, boolean> | boolean;

// Examples:
true                                    // Expand all
false                                   // Collapse all
{ "root.users": true, "root.users.0": false }  // Per-path control
```

### JSONTheme

```typescript
interface JSONTheme {
  background: string;
  foreground: string;
  keyColor: string;
  stringColor: string;
  numberColor: string;
  booleanColor: string;
  nullColor: string;
  punctuationColor: string;
  lineNumberColor: string;
  expandButtonColor: string;
  copyButtonColor: string;
  hoverBackground: string;
  selectedBackground: string;
  searchMatchBackground: string;
  searchCurrentBackground: string;
  fontSize: string;
  lineHeight: number;
  indentSize: number;
}
```

## Performance

### Benchmarks

| Data Size | Rows | DOM Nodes | Render Time | Memory |
|-----------|------|-----------|-------------|--------|
| 1MB JSON | ~5,000 | ~500-2,000 | <100ms | ~3MB |
| 5MB JSON | ~25,000 | ~500-2,000 | <150ms | ~8MB |
| 10MB JSON | ~50,000 | ~500-2,000 | <200ms | ~15MB |

### Comparison with react-obj-view

| Metric | AdvancedJsonViewer | react-obj-view |
|--------|-------------------|----------------|
| DOM Nodes (10MB) | ~1,500 | ~140,000 |
| Render Time | <200ms | 900-1500ms |
| Memory Usage | ~15MB | ~30MB |
| Search Navigation | Reliable | Requires retries |

## Architecture

### High-Level Overview

The AdvancedJsonViewer uses a **tree-based architecture** with O(log n) lookups instead of traditional O(n) flattening. This enables near-instant expand/collapse operations even on 100K+ node datasets.

#### Core Design Principles

1. **Tree-Based, Not Flat**: Instead of flattening JSON to an array (O(n) traversal on every expand/collapse), we maintain a hierarchical tree structure that mirrors the JSON data.

2. **JIT (Just-In-Time) Rendering**: Row data is computed on-demand using `getNodeByIndex()` which performs O(log n) binary search on the tree rather than traversing a pre-computed flat array.

3. **Data Layer vs Presentation Layer Separation**:
   - **Data Layer**: Tree building calculates FULL untruncated widths for all content (`maxContentWidth`)
   - **Presentation Layer**: Layout hooks apply mode-specific width constraints (nowrap uses full width, truncate/wrap apply max width)
   - This separation ensures width calculations are stable regardless of expansion state

4. **In-Place Mutations**: Expansion state changes mutate the tree in place (only affected nodes), using `expansionVersion` to trigger React re-renders. This is O(log n) instead of O(n) for creating new tree copies.

### Component Hierarchy

```
AdvancedJsonViewer (Main entry point)
├── SearchBar (Optional search UI)
└── VirtualizedJsonViewer or SimpleJsonViewer (Renderer)
    └── For each visible row:
        ├── JsonRowFixed (Fixed column - sticky)
        │   ├── LineNumber (optional)
        │   └── ExpandButton
        └── JsonRowScrollable (Scrollable column)
            ├── JsonKey (with indent)
            ├── JsonValue
            │   └── TruncatedString (for long strings)
            └── CopyButton (optional, on hover)
```

### Folder Structure

```
AdvancedJsonViewer/
├── AdvancedJsonViewer.tsx          # Main entry point
├── VirtualizedJsonViewer.tsx       # Virtualized renderer (TanStack Virtual)
├── SimpleJsonViewer.tsx            # Non-virtualized renderer
├── types.ts                        # TypeScript definitions
│
├── components/                     # React components
│   ├── JsonRowFixed.tsx           # Fixed column (line numbers + expand)
│   ├── JsonRowScrollable.tsx      # Scrollable column (content)
│   ├── JsonKey.tsx / JsonValue.tsx # Rendering components
│   ├── ExpandButton.tsx / LineNumber.tsx / CopyButton.tsx
│   ├── TruncatedString.tsx        # String truncation with popover
│   └── SearchBar.tsx              # Search UI
│
├── hooks/                         # React hooks
│   ├── useTreeState.ts            # Core: tree building & expansion
│   ├── useJsonViewerLayout.ts     # Width/height calculations
│   ├── useJsonTheme.ts            # Theme resolution
│   ├── useJsonSearch.ts           # Search state
│   ├── useSearchNavigationTree.ts # Search navigation
│   └── useJsonViewPreferences.ts  # localStorage persistence
│
├── utils/                         # Pure utility functions
│   ├── treeStructure.ts           # Tree building (4-pass algorithm)
│   ├── treeExpansion.ts           # Expand/collapse (O(log n))
│   ├── treeNavigation.ts          # getNodeByIndex (O(log n))
│   ├── searchJson.ts              # Search implementation
│   ├── calculateWidth.ts          # Width estimation
│   ├── estimateRowHeight.ts       # Height estimation
│   ├── jsonTypes.ts               # Type detection
│   ├── pathUtils.ts               # Path manipulation
│   └── debug.ts                   # Debug logging
│
└── workers/
    └── tree-builder.worker.ts     # Web Worker for large datasets
```

### Data Flow

#### 1. Initialization & Tree Building

```
User provides `data` prop
    ↓
useTreeState hook
    ↓
Estimate node count
    ↓
> 100K nodes? → Web Worker | < 100K nodes? → Main thread
    ↓
buildTreeFromJSON() (4-pass iterative algorithm)
    ↓
TreeState returned with rootNode + nodeMap + allNodes
```

#### 2. Tree Building: Four-Pass Algorithm

All passes use **iterative traversal** (explicit stack) to avoid stack overflow on deep JSON.

**Pass 1: Structure Building** (`buildTreeStructureIterative`)
- Creates TreeNode for each JSON node
- Establishes parent-child relationships
- Uses iterative DFS with explicit stack
- NO expansion decisions yet
- Complexity: O(n)

**Pass 1.5: Line Number Assignment** (`assignLineNumbersAndBuildAllNodes`)
- Pre-order traversal to assign absoluteLineNumber (1-indexed)
- Builds allNodes array (used for search)
- Ensures correct ordering for search results
- Complexity: O(n)

**Pass 2: Expansion State Application** (`applyExpansionStateIterative`)
- Reads expansion state from localStorage or props
- Sets isExpanded and userExpand for each node
- Does NOT compute offsets yet
- Complexity: O(n)

**Pass 3: Offset Computation** (`computeOffsetsIterative`)
- Post-order traversal (children before parents)
- Computes childOffsets and visibleDescendantCount
- Enables O(log n) binary search in getNodeByIndex
- Example: childOffsets = [1, 11, 16, 24] means child subtrees have 1, 10, 5, 8 visible nodes
- Complexity: O(n)

**Pass 4: Width Calculation** (`calculateTreeDimensions`)
- Iterates all nodes to find maxDepth and maxContentWidth
- Uses FULL untruncated string lengths (data layer)
- Complexity: O(n)

**Total: O(n) but only executed once on mount or data change**

#### 3. Rendering (O(m) where m = visible rows)

```
VirtualizedJsonViewer receives tree + expansionVersion
    ↓
useVirtualizer calculates visible indices (typically ~50 rows)
    ↓
For each visible index:
    getNodeByIndex(rootNode, index)
    ↓ (O(log n) binary search via childOffsets)
    treeNodeToFlatRow()
    ↓ (Convert to FlatJSONRow for compatibility)
    Render JsonRowFixed + JsonRowScrollable
```

#### 4. Expansion/Collapse (O(log n))

```
User clicks expand button
    ↓
toggleNodeExpansion(tree, nodeId)
    ↓
Toggle node.isExpanded (in-place mutation)
    ↓
Recompute childOffsets for this node → O(1)
    ↓
Propagate up ancestors (update offsets) → O(log n)
    ↓
Validate tree offsets (debug mode)
    ↓
Increment expansionVersion → triggers React re-render
    ↓
VirtualizedJsonViewer re-renders with new visible count
```

**Key optimization**: Only touched nodes are updated, not entire tree.

#### 5. Search Flow

```
User types in SearchBar
    ↓
searchInTree(tree, query, options)
    ↓
Iterate allNodes array (pre-order)
    ↓
Match against keys and values
    ↓
Return SearchMatch[] with row indices
    ↓
Calculate match counts per node (for badges)
    ↓
expandToNode() expands ancestors of current match
    ↓
findNodeIndex() returns visible index (iterative traversal)
    ↓
Virtualizer scrolls to index
```

### Key Architectural Decisions

#### 1. Tree Structure with childOffsets

**Decision**: Use hierarchical tree with cumulative childOffsets for binary search.

**Rationale**:
- Traditional flat array requires O(n) traversal to find row at index i
- With childOffsets, we binary search to find correct subtree in O(log n)
- Example: If child 2 has childOffsets[2] = 16, rows 0-16 are in its subtree

**Trade-offs**:
- More complex offset management during expansion
- Requires propagating changes up ancestor chain
- **Benefit**: 100x faster expansion on large trees

#### 2. In-Place Tree Mutation

**Decision**: Mutate tree nodes in place rather than creating new immutable copies.

**Rationale**:
- Expansion/collapse only affects one path through tree (O(log n) nodes)
- Creating new tree would be O(n) copy operation
- Use `expansionVersion` number to trigger React re-renders

**Trade-offs**:
- Doesn't follow React immutability patterns
- Need careful validation (debug mode)
- **Benefit**: Near-instant expand/collapse on 100K+ node trees

#### 3. Two-Column Layout (Fixed + Scrollable)

**Decision**: Split row into fixed column (line numbers, expand button) and scrollable column (content).

**Rationale**:
- Line numbers and expand buttons should stay visible during horizontal scroll
- Content can be very wide in nowrap mode (10,000+ pixels for long strings)
- CSS sticky positioning keeps fixed column in view

**Implementation**:
```typescript
<div style={{ display: "grid", gridTemplateColumns: `${fixedWidth}px auto` }}>
  <div style={{ position: "sticky", left: 0 }}>
    <JsonRowFixed />
  </div>
  <div style={{ minWidth: scrollableMinWidth, maxWidth: scrollableMaxWidth }}>
    <JsonRowScrollable />
  </div>
</div>
```

#### 4. Data Layer vs Presentation Layer Width Separation

**Decision**: Calculate full untruncated widths during tree building, apply constraints during rendering.

**Data Layer** (tree building, runs once):
- `tree.maxContentWidth` = full untruncated width of widest row
- Always uses FULL string lengths
- Used in nowrap mode for horizontal scrolling

**Presentation Layer** (rendering, runs per frame):
- `scrollableMinWidth` / `scrollableMaxWidth` computed per mode
- Truncate mode: maxWidth triggers CSS ellipsis
- Wrap mode: maxWidth triggers word wrap
- Nowrap mode: no maxWidth, uses full `tree.maxContentWidth`

**Benefit**: Width calculations stable regardless of expansion or mode changes.

#### 5. Web Worker for Large Datasets

**Decision**: Offload tree building to Web Worker for datasets >100K nodes.

**Rationale**:
- Tree building is O(n) with 4 full traversals
- Blocks main thread for 500ms+ on large datasets
- Web Worker keeps UI responsive during processing

**Implementation**:
- Main thread estimates node count
- If >100K, serialize data and send to worker
- Worker builds tree and transfers back
- Main thread applies expansion state from localStorage

#### 6. JIT Expansion State from localStorage

**Decision**: Read expansion state directly from localStorage during tree building, not via React context.

**Rationale**:
- Avoids unnecessary re-renders when expansion state changes
- localStorage is synchronous and fast
- Only component that needs expansion state is viewer itself

**Trade-offs**:
- Can't easily sync expansion state to parent component
- Need manual refresh if expansion changes externally
- **Benefit**: Zero re-renders from context updates

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Initial tree build | O(n) | 4-pass algorithm, only on mount |
| Expand/collapse single node | O(log n) | Only updates path to root |
| Expand all descendants | O(k) | Where k = nodes in subtree |
| Find node by index | O(log n) | Binary search via childOffsets |
| Search | O(n) | Iterates allNodes array once |
| Render visible rows | O(m) | Where m = visible rows (~50) |

**Memory usage**: O(n) for tree + O(n) for allNodes = 2n total

### String Wrap Modes

The component supports three string handling modes that affect how long strings are displayed:

#### Truncate (default)
- Strings are cut off with CSS ellipsis (`text-overflow: ellipsis`)
- Max width applied to scrollable column (~600px for value area)
- Single-line display for all rows
- Best for browsing large datasets quickly
- Users can hover for full content (via TruncatedString popover)

#### Wrap
- Long strings wrap to multiple lines (`white-space: pre-wrap`)
- Max width applied to force wrapping (~600px for value area)
- Multi-line display preserves readability
- Best for reading long strings without horizontal scroll
- Dynamic row heights (estimated, then measured)

#### Nowrap
- No truncation, no wrapping (`white-space: nowrap`)
- Uses full `tree.maxContentWidth` for horizontal scrolling
- Can result in very wide rows (10,000+ pixels)
- Best for inspecting exact string content
- Horizontal scrollbar appears for wide content

**Mode switching** is persisted to localStorage via `useJsonViewPreferences`.

### TreeNode Structure

The core data structure that replaces flat arrays:

```typescript
interface TreeNode {
  // Identity
  id: string;                    // "root.users.0.name"
  key: string | number;          // "name" or 0
  pathArray: (string | number)[]; // ["root", "users", 0, "name"]

  // Value
  value: unknown;
  type: "null" | "boolean" | "number" | "string" | "array" | "object";

  // Structure
  depth: number;                 // 0 = root
  parentNode: TreeNode | null;
  children: TreeNode[];
  childCount: number;

  // Expansion
  isExpandable: boolean;
  isExpanded: boolean;
  userExpand: boolean | undefined; // User's explicit preference

  // Navigation (enables O(log n) lookup)
  childOffsets: number[];        // Cumulative visible descendant counts
  visibleDescendantCount: number; // Total visible when expanded

  // Position
  absoluteLineNumber: number;    // 1-indexed line in fully expanded tree
  indexInParent: number;
  isLastChild: boolean;
}
```

**childOffsets** is the key to O(log n) navigation:
```typescript
// Example: node has 3 children with 10, 5, 8 visible descendants
childOffsets = [11, 17, 26]
// Meaning:
//   - Child 0 spans indices 0-10 (self + 10 descendants)
//   - Child 1 spans indices 11-16 (self + 5 descendants)
//   - Child 2 spans indices 17-25 (self + 8 descendants)
//   - Total: 26 visible descendants

// To find node at index 15:
// 1. Binary search childOffsets: 15 > 11, 15 < 17 → child 1
// 2. Recurse into child 1 with adjusted index: 15 - 11 = 4
// 3. Repeat until index = 0 → found!
```

## Search Features

### Keyboard Shortcuts

- `Enter` - Next match
- `Shift+Enter` - Previous match
- `Escape` - Clear search

### Search Options

- Case-insensitive by default
- Searches both keys and values
- Automatic ancestor expansion
- Match count display
- Current match highlighting

## Expansion State

The expansion state can be controlled externally or managed internally:

### Boolean Mode

```tsx
// Expand all
<AdvancedJsonViewer data={data} initialExpansion={true} />

// Collapse all
<AdvancedJsonViewer data={data} initialExpansion={false} />
```

### Per-Path Mode

```tsx
const [expansion, setExpansion] = useState({
  "root": true,
  "root.users": true,
  "root.users.0": false, // Collapsed
  "root.users.1": true,
});

<AdvancedJsonViewer
  data={data}
  expansionState={expansion}
  onExpansionChange={setExpansion}
/>
```

## Theming

### Using CSS Variables

The component uses CSS variables from your existing theme by default:

- `--background`
- `--foreground`
- `--muted-foreground`
- `--accent`

### Custom Theme

```tsx
<AdvancedJsonViewer
  data={data}
  theme={{
    // Colors
    numberColor: "#0ea5e9",
    stringColor: "#10b981",
    booleanColor: "#f59e0b",
    keyColor: "#6366f1",

    // Sizes
    fontSize: "0.875rem",
    lineHeight: 28,
    indentSize: 24,

    // Search
    searchMatchBackground: "rgba(255, 255, 0, 0.3)",
    searchCurrentBackground: "rgba(255, 255, 0, 0.5)",
  }}
/>
```

## Examples

### Trace I/O Display

```tsx
<AdvancedJsonViewer
  data={trace.input}
  enableSearch={true}
  showLineNumbers={false}
  truncateStringsAt={100}
  expansionState={expansionState.input}
  onExpansionChange={(state) => setFieldExpansion("input", state)}
/>
```

### Metadata Display

```tsx
<AdvancedJsonViewer
  data={observation.metadata}
  virtualized={false} // Small data, no virtualization needed
  enableCopy={true}
  truncateStringsAt={50}
/>
```

### Large Dataset

```tsx
<AdvancedJsonViewer
  data={largeDataset}
  virtualized={true} // Force virtualization
  enableSearch={true}
  showLineNumbers={true}
  className="h-full" // Full height container
/>
```

## Troubleshooting

### Search Not Working

Make sure `enableSearch={true}` is set (it's true by default).

### Virtualization Issues

If you experience scroll issues, try:
1. Ensure the parent container has a fixed height
2. Add `className="h-full"` or set explicit height
3. Check that `virtualized` prop is not explicitly set to `false`

### Performance Issues

For very large datasets (>10MB):
1. Consider pre-filtering the data
2. Use `truncateStringsAt` to limit string rendering
3. Ensure virtualization is enabled (`virtualized={true}`)
4. Disable `wrapLongStrings` if not needed

### Theme Not Applied

Make sure you're using `useTheme` from `next-themes` if you want automatic light/dark mode.

## Migration from react-obj-view

### Before

```tsx
import { ObjectView } from 'react-obj-view';

<ObjectView
  valueGetter={() => data}
  expandLevel={3}
  showLineNumbers={false}
/>
```

### After

```tsx
import { AdvancedJsonViewer } from '@/components/ui/AdvancedJsonViewer';

<AdvancedJsonViewer
  data={data}
  initialExpansion={true}
  showLineNumbers={false}
/>
```

## Testing

Tests are colocated with utility files using `.clienttest.ts` extension:
- `treeStructure.clienttest.ts` - Tree building and structure tests
- `treeExpansion.clienttest.ts` - Expansion/collapse logic tests
- `treeNavigation.clienttest.ts` - Navigation and lookup tests
- `searchJson.clienttest.ts` - Search functionality tests
- `jsonTypes.clienttest.ts` - Type detection tests
- `pathUtils.clienttest.ts` - Path manipulation tests

Run tests with:
```bash
pnpm --filter=web run test-client --testPathPattern="AdvancedJsonViewer"
```

## Known Limitations

1. **No horizontal virtualization**: Rows can be very wide (10,000px+) in nowrap mode, but entire width is rendered. This can impact performance for extremely long strings.

2. **No column resize**: The fixed/scrollable column split is automatic, users can't adjust it manually.

3. **Search is client-side only**: All matches computed in memory, no streaming/pagination. Large result sets (10,000+ matches) may cause performance issues.

4. **Memory constraints**: Very large JSON (1M+ nodes) may cause memory issues despite virtualization, as entire tree structure is kept in memory.

5. **No edit support**: This is a read-only viewer. Inline editing is not supported.

6. **No diff mode**: Cannot compare two JSON objects side-by-side.

7. **Line wrap mode performance**: In wrap mode with many long strings, row height measurement can be expensive. Estimated heights help but there's still some layout thrashing.

## Future Enhancements

- [ ] Horizontal virtualization for extremely wide rows
- [ ] Incremental search (stop after N matches, pagination)
- [ ] Copy row path to clipboard (e.g., `root.users[0].name`)
- [ ] Export visible/expanded JSON (copy what you see)
- [ ] Keyboard navigation (arrow keys to traverse tree)
- [ ] Column resize (drag to adjust fixed/scrollable split)
- [ ] Diff mode (compare two JSON objects)
- [ ] Inline editing with validation
- [ ] Vim keybindings (for power users)
- [ ] Custom filters (hide/show based on path patterns)
- [ ] Bookmarks (save/restore specific expansion states)

## Implementation Notes for Developers

### Why not react-window or react-virtuoso?

We use `@tanstack/react-virtual` because:
- Already in project dependencies (zero new deps)
- Supports dynamic row heights with measurement
- Lightweight and performant
- Works well with our getItemKey approach

### Why iterative algorithms instead of recursion?

All tree algorithms use **explicit stack-based iteration** instead of recursion to:
- Avoid stack overflow on deeply nested JSON (1000+ levels)
- Enable better debugging (can inspect stack state)
- Match JavaScript engine optimizations

Example pattern:
```typescript
// ❌ Recursive (can stack overflow)
function traverse(node: TreeNode) {
  process(node);
  node.children.forEach(child => traverse(child));
}

// ✅ Iterative (safe for any depth)
function traverse(rootNode: TreeNode) {
  const stack = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    process(node);
    node.children.forEach(child => stack.push(child));
  }
}
```

### When to use Web Worker?

Tree building uses Web Worker automatically when:
- Estimated node count > 100,000
- Browser supports Web Workers
- Not in SSR context

The worker serializes the tree and transfers it back, which has overhead (~100ms), but keeps the UI responsive during processing.

### Debug mode

Enable debug logging by setting localStorage:
```javascript
localStorage.setItem('debug:AdvancedJsonViewer', 'true');
```

This logs:
- Tree building performance
- Navigation operations
- Search operations
- Expansion state changes
- Validation results (offset checking)

## License

MIT - Same as the parent Langfuse project
