# AdvancedJsonViewer

A high-performance JSON viewer component built for rendering large datasets (10K+ nodes) with virtualization, search, and near-instant expand/collapse operations.

## Quick Start

### Basic Usage

```tsx
import { AdvancedJsonViewer } from "@/components/ui/AdvancedJsonViewer";

function MyComponent() {
  const data = { users: [{ name: "Alice", age: 30 }] };
  return <AdvancedJsonViewer data={data} />;
}
```

### With Search & Line Numbers

```tsx
<AdvancedJsonViewer
  data={largeDataset}
  enableSearch={true}
  showLineNumbers={true}
  field="myData" // localStorage key for expansion state persistence
/>
```

### Essential Props

| Prop              | Type                               | Default      | Description                                        |
| ----------------- | ---------------------------------- | ------------ | -------------------------------------------------- |
| `data`            | `unknown`                          | required     | JSON data to display                               |
| `field`           | `string \| null`                   | `null`       | localStorage key for expansion state persistence   |
| `enableSearch`    | `boolean`                          | `true`       | Enable search with highlighting                    |
| `showLineNumbers` | `boolean`                          | `false`      | Show line numbers in fixed column                  |
| `stringWrapMode`  | `"truncate" \| "wrap" \| "nowrap"` | `"truncate"` | How to handle long strings                         |
| `virtualized`     | `boolean`                          | auto         | Force virtualization (auto-detected at >500 nodes) |

See `types.ts` for complete prop definitions.

## Core Concepts

### Why Tree-Based Architecture?

**The Problem**: A naive implementation flattens JSON + expansion state into a single array. On every expand/collapse, the entire array must be rebuilt by traversing the JSON tree and checking expansion state for each node. For 50K nodes, this causes **200ms+ blocking** on every interaction—unacceptable UX.

**The Solution**: Build a hierarchical tree structure once, where each `TreeNode` owns its expansion state. Navigation uses binary search via `childOffsets` for O(log n) lookups instead of O(n) array traversal.

**The Result**:

- Initial build: O(n) once on mount (~50ms for 10K nodes, offloaded to Web Worker)
- Expand/collapse: O(log n) (<10ms regardless of dataset size)
- Rendering: O(m) where m = visible rows (~50 rows via virtualization)

### String Handling Modes

**Truncate** (default)

- CSS ellipsis at max width (~600px for value area)
- Single-line display, hover for full content
- Best for browsing large datasets

**Wrap**

- Multi-line display with `white-space: pre-wrap`
- Max width forces wrapping (~600px)
- Best for reading long strings without horizontal scroll
- Dynamic row heights (estimated, then measured)

**Nowrap**

- No truncation, uses full `tree.maxContentWidth`
- Can result in very wide rows (10,000+ pixels)
- Horizontal scrollbar for wide content
- Best for inspecting exact content

Mode preference persisted to localStorage.

### Performance Characteristics

| Operation            | Complexity | Notes                                       |
| -------------------- | ---------- | ------------------------------------------- |
| Initial tree build   | O(n)       | 4-pass algorithm, only on mount/data change |
| Expand/collapse node | O(log n)   | Only updates node + ancestors               |
| Find node by index   | O(log n)   | Binary search via childOffsets              |
| Search               | O(n)       | Single pass through allNodes array          |
| Render               | O(m)       | m = visible rows (~50 regardless of size)   |

Memory: O(n) for tree + O(n) for allNodes = 2n total

## Architecture

### Tree Building: Four-Pass Algorithm

All passes use **iterative traversal** (explicit stack) to avoid stack overflow on deeply nested JSON (1000+ levels) that would happen with recursion.

**Pass 1: Structure** (`buildTreeStructureIterative`)

- Creates TreeNode for each JSON element
- Establishes parent-child relationships
- Iterative DFS, no recursion
- **Why**: Prevents stack overflow on deep JSON

**Pass 2: Expansion** (`applyExpansionStateIterative`)

- Reads expansion state from localStorage or props
- Sets `isExpanded` and `userExpand` on each node
- **Why**: Separates structure building from state application (applying expansion state is significanttly faster than tree building)

**Pass 3: Offsets** (`computeOffsetsIterative`)

- Post-order traversal to compute `childOffsets` and `visibleDescendantCount`
- **Why**: Enables O(log n) binary search in `getNodeByIndex()`

**Pass 4: Dimensions** (`calculateTreeDimensions`)

- Finds `maxDepth` and `maxContentWidth`
- **Why**: Stable width calculations regardless of expansion state or string mode

**Pass 1.5**: Line numbers assigned in pre-order for search compatibility.

### Key Design Decisions

#### 1. Tree Structure with childOffsets

**Decision**: Hierarchical tree with cumulative `childOffsets` array for binary search.

**Why**: Traditional flat array requires O(n) traversal to find row at index i. With childOffsets, we binary search to find the correct subtree in O(log n).

**Example**:

```typescript
// Node has 3 children with 10, 5, 8 visible descendants
childOffsets = [11, 17, 26];
// Meaning: Child 0 spans 0-10, Child 1 spans 11-16, Child 2 spans 17-25

// To find index 15: Binary search → 15 > 11, 15 < 17 → Child 1
```

**Tradeoff**: More complex offset management, but 100x faster expand/collapse.

#### 2. In-Place Tree Mutation

**Decision**: Mutate tree nodes in place rather than creating immutable copies.

**Why**: Expansion affects one path through the tree (O(log n) nodes). Creating a new tree would be O(n) copy operation. Use `expansionVersion` counter to trigger React re-renders.

**Tradeoff**: Doesn't follow React immutability patterns, requires validation in debug mode. Benefit: Near-instant operations on large trees.

#### 3. Two-Column Layout (Fixed + Scrollable)

**Decision**: Split each row into fixed column (line numbers, expand button) and scrollable column (content).

**Why**: Line numbers and controls should stay visible during horizontal scroll. Content can be 10,000+ pixels wide in nowrap mode.

**Implementation**: CSS grid + sticky positioning keeps fixed column in view.

#### 4. Data Layer vs Presentation Layer Width

**Decision**: Calculate full untruncated widths during tree building (data layer), apply constraints during rendering (presentation layer).

**Why**:

- Tree building runs once, rendering runs every frame/scroll
- If we calculate truncated widths during build, they'd be wrong when user switches modes
- Separation ensures stable calculations

**Data Layer**: `tree.maxContentWidth` = full width of widest row (used in nowrap)
**Presentation Layer**: `scrollableMinWidth/MaxWidth` per mode (used in truncate/wrap)

#### 5. Web Worker for Large Datasets

**Decision**: Offload tree building to Web Worker when estimated node count > 10K.

**Why**: Tree building is O(n) with 4 full traversals. Blocks main thread for 50ms+ on datasets with >10K nodes.

**Tradeoff**: Worker serialization overhead, but keeps UI responsive (shows "Loading" spinner during build).

#### 6. Direct localStorage Access

**Decision**: Read expansion state directly from localStorage during tree building, not via React context.

**Why**: Avoids re-renders when expansion state changes. localStorage is synchronous and fast. Only the viewer needs expansion state.

**Tradeoff**: Can't easily sync expansion state to parent component. Benefit: Zero re-renders from context updates (!).

### TreeNode Structure

```typescript
interface TreeNode {
  // Identity
  id: string; // "root.users.0.name"
  key: string | number;
  pathArray: (string | number)[];

  // Value
  value: unknown;
  type: "null" | "boolean" | "number" | "string" | "array" | "object";

  // Structure
  depth: number; // 0 = root
  parentNode: TreeNode | null;
  children: TreeNode[];
  childCount: number;

  // Expansion (node-owned state)
  isExpandable: boolean;
  isExpanded: boolean;
  userExpand: boolean | undefined; // Explicit user preference

  // Navigation (enables O(log n))
  childOffsets: number[]; // Cumulative visible descendant counts
  visibleDescendantCount: number;

  // Position
  absoluteLineNumber: number; // 1-indexed in fully expanded tree
  indexInParent: number;
  isLastChild: boolean;
}
```

### Key Files

```
utils/
  treeStructure.ts       - 4-pass tree building algorithm
  treeNavigation.ts      - getNodeByIndex() O(log n) via binary search
  treeExpansion.ts       - toggleNodeExpansion() with ancestor propagation

hooks/
  useTreeState.ts        - Orchestrates tree lifecycle & expansion
  useJsonViewerLayout.ts - Width/height calculations per string mode

components/
  VirtualizedJsonViewer.tsx - TanStack Virtual integration
  JsonRowFixed.tsx          - Fixed column (line numbers, expand)
  JsonRowScrollable.tsx     - Scrollable column (content)
```

### Folder Structure

```
AdvancedJsonViewer/
├── AdvancedJsonViewer.tsx       # Main entry point
├── VirtualizedJsonViewer.tsx    # Virtualized renderer
├── SimpleJsonViewer.tsx         # Non-virtualized (small datasets)
├── types.ts                     # TypeScript definitions
├── components/                  # UI components
├── hooks/                       # React hooks
├── utils/                       # Pure functions (tree ops, search)
└── workers/                     # Web Worker for large datasets
```

## Development

### Testing

Tests use `.clienttest.ts` extension and are colocated with utils:

```bash
pnpm --filter=web run test-client --testPathPattern="AdvancedJsonViewer"
```

Key test files:

- `treeStructure.clienttest.ts` - Tree building, passes 1-4
- `treeNavigation.clienttest.ts` - getNodeByIndex, binary search
- `treeExpansion.clienttest.ts` - Expand/collapse operations
- `searchJson.clienttest.ts` - Search algorithm

### Debug Mode

Enable detailed logging:

```javascript
localStorage.setItem("debug:AdvancedJsonViewer", "true");
```

Logs:

- Tree building performance (pass timings)
- Navigation operations (getNodeByIndex calls)
- Offset validation (checks childOffsets correctness)
- Search operations

### Why Iterative Algorithms?

All tree operations use **explicit stack-based iteration** instead of recursion:

```typescript
// ❌ Recursive (can stack overflow at depth 1000+)
function traverse(node: TreeNode) {
  process(node);
  node.children.forEach((child) => traverse(child));
}

// ✅ Iterative (safe for any depth)
function traverse(rootNode: TreeNode) {
  const stack = [rootNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    process(node);
    node.children.forEach((child) => stack.push(child));
  }
}
```

Benefits: No stack overflow, better debugging, matches JS engine optimizations.

### Why TanStack Virtual?

- Already in project dependencies (zero new deps)
- Supports dynamic row heights with measurement
- Works well with our `getItemKey` approach (node IDs)
- Lightweight and performant

## API Reference

### Core Types

```typescript
type StringWrapMode = "nowrap" | "truncate" | "wrap";

type ExpansionState = Record<string, boolean> | boolean;
// Examples:
//   true                           // Expand all
//   false                          // Collapse all
//   { "root.users": true }         // Per-path control

interface AdvancedJsonViewerProps {
  data: unknown;
  field?: string | null; // localStorage key
  virtualized?: boolean; // Auto-detected by default
  theme?: PartialJSONTheme;
  initialExpansion?: ExpansionState;
  enableSearch?: boolean;
  showLineNumbers?: boolean;
  enableCopy?: boolean;
  stringWrapMode?: StringWrapMode;
  truncateStringsAt?: number | null;
  className?: string;
  scrollContainerRef?: RefObject<HTMLDivElement>;
  // ... see types.ts for complete list
}
```

See `types.ts` for complete type definitions including `JSONTheme`, `SearchMatch`, `TreeNode`, etc.

## Known Limitations

1. **No horizontal virtualization** - Wide rows (10,000px+) fully rendered in nowrap mode
2. **Client-side search only** - All matches computed in memory (can be slow for 10,000+ matches)
3. **Memory constraints** - 1M+ nodes may cause issues despite virtualization
4. **No inline editing** - Read-only viewer
5. **Wrap mode performance** - Many long strings require height measurement (layout thrashing)

## License

MIT - Same as parent Langfuse project
