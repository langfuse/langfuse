# PrettyJsonView Refactor: Component Specifications

## Component Hierarchy

```
Presentation Layer (Pure UI)
├── JSONViewer - Virtualized JSON tree view
├── TableViewer - Virtualized path/value table view
└── SimpleDataViewer - Non-virtualized simple display

Coordination Layer (Routing)
├── IODataViewer - Routes I/O display to JSONViewer or TableViewer
└── MetadataViewer - Routes metadata display to JSONViewer or TableViewer
```

---

## Presentation Layer Components

### 1. JSONViewer

**Purpose:** Virtualized JSON syntax highlighting view using `react-obj-view`

**Props:**
```typescript
interface JSONViewerProps {
  /** Data to display (any JSON-serializable value) */
  data: unknown;

  /** Optional title displayed above the viewer */
  title?: string;

  /** Expansion state: boolean (all/none) or object (per-path) */
  expansionState?: Record<string, boolean> | boolean;

  /** Callback when expansion changes */
  onExpansionChange?: (state: Record<string, boolean> | boolean) => void;

  /** Custom CSS classes */
  className?: string;

  /** Show loading skeleton */
  isLoading?: boolean;
}
```

**Implementation:**
```typescript
// web/src/components/ui/PrettyJSONView2/JSONViewer.tsx
import { ReactObjView } from "react-obj-view";
import "react-obj-view/dist/style.css";

export function JSONViewer({
  data,
  title,
  expansionState = true,
  onExpansionChange,
  className,
  isLoading = false,
}: JSONViewerProps) {
  if (isLoading) {
    return <LoadingSkeleton title={title} />;
  }

  return (
    <div className={cn("json-viewer", className)}>
      {title && <h3 className="text-sm font-medium mb-2">{title}</h3>}
      <ReactObjView
        data={data}
        collapsed={expansionState === false}
        // ... additional react-obj-view props
      />
    </div>
  );
}
```

**Key Features:**
- Virtualized rendering (only visible nodes in DOM)
- Syntax highlighting
- Expand/collapse with state management
- Copy value on click
- Dark mode support via CSS variables

**Performance:**
- Target: < 150ms initial render for 10MB JSON
- DOM nodes: ~500-2,000 (vs 139K+ with current implementation)
- Memory: ~2-5MB (vs ~30MB with current implementation)

---

### 2. TableViewer

**Purpose:** Virtualized path/value table view (like current JsonPrettyTable)

**Props:**
```typescript
interface TableViewerProps {
  /** Data to display (any JSON-serializable value) */
  data: unknown;

  /** Optional title displayed above the table */
  title?: string;

  /** Expansion state: boolean (all/none) or object (per-path) */
  expansionState?: Record<string, boolean> | boolean;

  /** Callback when expansion changes */
  onExpansionChange?: (state: Record<string, boolean> | boolean) => void;

  /** Show null values in table (default: false) */
  showNullValues?: boolean;

  /** Show type badges (default: true) */
  showTypeBadge?: boolean;

  /** Sticky header (default: true) */
  stickyHeader?: boolean;

  /** Scrollable container (default: true) */
  scrollable?: boolean;

  /** Custom CSS classes */
  className?: string;

  /** Show loading skeleton */
  isLoading?: boolean;
}
```

**Implementation:**
```typescript
// web/src/components/ui/PrettyJSONView2/TableViewer.tsx
export function TableViewer({
  data,
  title,
  expansionState,
  onExpansionChange,
  showNullValues = false,
  showTypeBadge = true,
  stickyHeader = true,
  scrollable = true,
  className,
  isLoading = false,
}: TableViewerProps) {
  // Transform JSON to table rows
  const tableData = useMemo(() =>
    transformToTableRows(data, showNullValues),
    [data, showNullValues]
  );

  // Calculate expansion state using existing algorithm
  const finalExpansionState = useMemo(() =>
    calculateExpansionState(tableData, expansionState),
    [tableData, expansionState]
  );

  // Render virtualized table using react-obj-view or custom solution
  return (
    <div className={cn("table-viewer", className)}>
      {title && <h3 className="text-sm font-medium mb-2">{title}</h3>}
      <VirtualizedTable
        data={tableData}
        expansionState={finalExpansionState}
        onExpansionChange={onExpansionChange}
        stickyHeader={stickyHeader}
        scrollable={scrollable}
      />
    </div>
  );
}
```

**Key Features:**
- Path | Value column layout
- Smart expansion heuristics (reuse from PrettyJsonView)
- Type badges (string, number, object, array)
- Virtualized rows (for large objects)
- Copy value on click

**Performance:**
- Target: < 150ms initial render for 10MB JSON
- DOM nodes: ~500-2,000 visible rows
- Handles deeply nested structures

---

### 3. SimpleDataViewer

**Purpose:** Lightweight JSON display for small data (no virtualization overhead)

**Props:**
```typescript
interface SimpleDataViewerProps {
  /** Data to display (any JSON-serializable value) */
  data: unknown;

  /** Custom CSS classes */
  className?: string;
}
```

**Implementation:**
```typescript
// web/src/components/ui/PrettyJSONView2/SimpleDataViewer.tsx
export function SimpleDataViewer({
  data,
  className,
}: SimpleDataViewerProps) {
  return (
    <div className={cn("simple-data-viewer", className)}>
      <ReactObjView
        data={data}
        collapsed={false}  // Auto-expand all
        // Minimal config, no state management
      />
    </div>
  );
}
```

**Key Features:**
- No virtualization (all nodes rendered)
- Auto-expands everything
- No title, no loading state, no expansion management
- Minimal API surface

**Use Cases:**
- Tool arguments (typically < 1KB)
- Small configuration objects
- Embedded displays where space is limited

**Performance:**
- Target: < 50ms for < 10KB data
- Not suitable for > 100KB data

---

## Coordination Layer Components

### 4. IODataViewer

**Purpose:** Routes I/O display to appropriate viewer based on view mode

**Props:**
```typescript
interface IOExpansionState {
  input?: Record<string, boolean> | boolean;
  output?: Record<string, boolean> | boolean;
}

interface IODataViewerProps {
  /** Input data */
  input?: unknown;

  /** Output data */
  output?: unknown;

  /** View mode: JSON syntax highlighting or table */
  viewMode: "json" | "pretty";

  /** Media attachments */
  media?: MediaReturnType[];

  /** Expansion state for both input and output */
  expansionState?: IOExpansionState;

  /** Callback when expansion changes */
  onExpansionChange?: (state: IOExpansionState) => void;
}
```

**Implementation:**
```typescript
// web/src/components/ui/PrettyJSONView2/IODataViewer.tsx
export function IODataViewer({
  input,
  output,
  viewMode,
  media,
  expansionState,
  onExpansionChange,
}: IODataViewerProps) {
  const Viewer = viewMode === "json" ? JSONViewer : TableViewer;

  return (
    <>
      {input && (
        <Viewer
          title="Input"
          data={input}
          expansionState={expansionState?.input}
          onExpansionChange={(exp) =>
            onExpansionChange?.({ ...expansionState, input: exp })
          }
        />
      )}
      {output && (
        <Viewer
          title="Output"
          data={output}
          expansionState={expansionState?.output}
          onExpansionChange={(exp) =>
            onExpansionChange?.({ ...expansionState, output: exp })
          }
        />
      )}
      {media && media.length > 0 && (
        <MediaSection media={media} />
      )}
    </>
  );
}
```

**Key Features:**
- Routes to JSONViewer or TableViewer based on viewMode
- Adds "Input" and "Output" titles
- Manages expansion state for both input and output
- Handles media attachments section
- NO domain logic (no ChatML detection, no markdown detection)

**Responsibilities:**
- ✅ Route to correct viewer
- ✅ Add section titles
- ✅ Manage expansion state
- ❌ NO format detection
- ❌ NO parsing

---

### 5. MetadataViewer

**Purpose:** Routes metadata display to appropriate viewer based on view mode

**Props:**
```typescript
interface MetadataViewerProps {
  /** Metadata to display */
  data: unknown;

  /** Optional title (default: "Metadata") */
  title?: string;

  /** View mode: JSON syntax highlighting or table */
  viewMode: "json" | "pretty";

  /** Expansion state */
  expansionState?: Record<string, boolean> | boolean;

  /** Callback when expansion changes */
  onExpansionChange?: (state: Record<string, boolean> | boolean) => void;

  /** Media attachments (optional) */
  media?: MediaReturnType[];
}
```

**Implementation:**
```typescript
// web/src/components/ui/PrettyJSONView2/MetadataViewer.tsx
export function MetadataViewer({
  data,
  title = "Metadata",
  viewMode,
  expansionState,
  onExpansionChange,
  media,
}: MetadataViewerProps) {
  const Viewer = viewMode === "json" ? JSONViewer : TableViewer;

  return (
    <>
      <Viewer
        title={title}
        data={data}
        expansionState={expansionState}
        onExpansionChange={onExpansionChange}
      />
      {media && media.length > 0 && (
        <MediaSection media={media} />
      )}
    </>
  );
}
```

**Key Features:**
- Routes to JSONViewer or TableViewer based on viewMode
- Simpler than IODataViewer (single data field, not input/output)
- Metadata-specific defaults (e.g., more compact styling)

**Responsibilities:**
- ✅ Route to correct viewer
- ✅ Add title
- ✅ Manage expansion state
- ❌ NO format detection
- ❌ NO parsing

---

## Shared Utilities

### LoadingSkeleton
```typescript
function LoadingSkeleton({ title }: { title?: string }) {
  return (
    <div className="animate-pulse">
      {title && <div className="h-4 w-24 bg-muted rounded mb-2" />}
      <div className="space-y-2">
        <div className="h-8 bg-muted rounded" />
        <div className="h-8 bg-muted rounded w-5/6" />
        <div className="h-8 bg-muted rounded w-4/6" />
      </div>
    </div>
  );
}
```

### MediaSection
```typescript
function MediaSection({ media }: { media: MediaReturnType[] }) {
  return (
    <div className="media-section mt-4">
      {media.map((item) => (
        <MediaItem key={item.id} item={item} />
      ))}
    </div>
  );
}
```

---

## Design Principles

1. **Single Responsibility:** Each component has ONE job
2. **Pure Rendering:** Presentation components don't understand domain concepts
3. **Minimal Props:** Only essential props, no bloated APIs
4. **Composition:** Small, focused components that compose well
5. **Performance First:** Virtualization by default for large data
6. **Type Safe:** Full TypeScript with strict types
7. **Testable:** Pure functions, easy to unit test
