# PrettyJsonView Refactor: Target Architecture

## Current Problems

### 1. Performance: DOM Explosion
**Example:** Large observation with 10MB JSON → **139,910 DOM nodes**
- React18JsonView renders entire tree upfront
- No virtualization → all nodes in DOM simultaneously
- Result: 500-1500ms UI freeze, janky scrolling, ~30MB memory

### 2. Confused Responsibilities
PrettyJsonView (a UI component) makes domain decisions:
- Detects ChatML format → `isChatMLFormat()` (line 133)
- Detects markdown → `isMarkdownContent()` (line 164)
- Decides what to render based on detection

**Problem:** Presentation layer shouldn't understand domain concepts.

### 3. Duplicate Logic
Format detection happens multiple times:
- IOPreviewPretty: `useChatMLParser()` detects ChatML
- PrettyJsonView: `isChatMLFormat()` detects ChatML again
- IOPreviewPretty: `shouldRenderMarkdown` estimates size
- PrettyJsonView: `isMarkdownContent()` checks size again

**Result:** Wasted CPU, harder to maintain.

### 4. Mixed Usage Patterns
17 files use PrettyJsonView for 4 different purposes:
- Large I/O data (needs virtualization)
- Small metadata (doesn't need virtualization)
- Tool arguments (simple display)
- Embedded log view (special styling)

**Problem:** One component trying to serve all use cases → bloated API, performance tradeoffs.

---

## Target Architecture: 3-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: Domain Layer (Understands DATA)                    │
│ ────────────────────────────────────────────────────────────│
│ Components: IOPreviewPretty, TraceDetailView                │
│ Responsibilities:                                            │
│ - Detect format (ChatML, Markdown, JSON)                    │
│ - Validate structure                                         │
│ - Estimate size/complexity                                   │
│ - Parse/transform data                                       │
│ - Manage state (view mode, expansion)                       │
└────────────────────┬────────────────────────────────────────┘
                     │ Passes: format + data + decisions
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: Coordination Layer (Makes DECISIONS)               │
│ ────────────────────────────────────────────────────────────│
│ Components: IODataViewer, MetadataViewer, LogDataViewer     │
│ Responsibilities:                                            │
│ - Route to correct viewer (JSON vs Table)                   │
│ - Add context-specific UI (titles, media, styling)          │
│ - Pass expansion state to viewers                           │
│ - NO domain logic, NO rendering                             │
└────────────────────┬────────────────────────────────────────┘
                     │ Passes: data + config
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: Presentation Layer (RENDERS)                       │
│ ────────────────────────────────────────────────────────────│
│ Components: JSONViewer, TableViewer, SimpleDataViewer       │
│ Responsibilities:                                            │
│ - Render virtualized views                                  │
│ - Handle user interactions (expand/collapse)                │
│ - Copy to clipboard                                         │
│ - Theming, styling                                          │
│ - NO domain knowledge, NO format detection                  │
└─────────────────────────────────────────────────────────────┘
```

### Key Principle: Detect Once, Render Pure
Format detection happens ONCE at the top → pure rendering components below.

---

## New Components Overview

### Presentation Layer (Pure UI)

#### 1. **JSONViewer** - Virtualized JSON Tree
```typescript
interface JSONViewerProps {
  data: unknown;
  title?: string;
  expansionState?: Record<string, boolean> | boolean;
  onExpansionChange?: (state: Record<string, boolean> | boolean) => void;
  className?: string;
  isLoading?: boolean;
}
```
- Uses `react-obj-view` for virtualization
- Only visible nodes in DOM (~500-2000 vs 140K)
- 10-20x faster than current implementation

#### 2. **TableViewer** - Virtualized JSON Table
```typescript
interface TableViewerProps {
  data: unknown;
  title?: string;
  expansionState?: Record<string, boolean> | boolean;
  onExpansionChange?: (state: Record<string, boolean> | boolean) => void;
  showNullValues?: boolean;
  showTypeBadge?: boolean;
  stickyHeader?: boolean;
  scrollable?: boolean;
  className?: string;
  isLoading?: boolean;
}
```
- Path | Value column layout (like current JsonPrettyTable)
- Smart expansion heuristics (internal)
- Virtualized (TBD: react-obj-view or custom)

#### 3. **SimpleDataViewer** - Lightweight (No Virtualization)
```typescript
interface SimpleDataViewerProps {
  data: unknown;
  className?: string;
}
```
- For small data (tool arguments, small objects)
- No virtualization overhead
- Auto-expands all

### Coordination Layer (Routers + Context)

#### 4. **IODataViewer** - I/O Display Router
```typescript
interface IODataViewerProps {
  input?: unknown;
  output?: unknown;
  viewMode: "json" | "pretty";
  media?: MediaReturnType[];
  expansionState?: IOExpansionState;
  onExpansionChange?: (state: IOExpansionState) => void;
}
```
- Routes to JSONViewer or TableViewer based on viewMode
- Adds Input/Output titles
- Adds media attachments section
- NO format detection (parent already did this)

#### 5. **MetadataViewer** - Metadata Router
```typescript
interface MetadataViewerProps {
  data: unknown;
  title?: string;
  viewMode: "json" | "pretty";
  expansionState?: Record<string, boolean> | boolean;
  onExpansionChange?: (state: Record<string, boolean> | boolean) => void;
  media?: MediaReturnType[];
}
```
- Routes to JSONViewer or TableViewer
- Metadata-specific styling defaults
- Simpler than IODataViewer (no format detection needed)

---

## Before/After Examples

### Example 1: I/O Display (Most Complex)

**BEFORE (Confused Responsibilities):**
```typescript
// IOPreviewPretty.tsx
export function IOPreviewPretty({ input, output, ... }) {
  // ✅ Domain logic
  const { canDisplayAsChat, ... } = useChatMLParser(input, output, ...);
  const shouldRenderMarkdown = useMemo(() => estimateSize(...));

  // ❌ Rendering logic mixed in
  return canDisplayAsChat ? (
    <ChatMessageList messages={allMessages} />
  ) : (
    <JsonInputOutputView parsedInput={parsedInput} parsedOutput={parsedOutput} />
  );
}

// JsonInputOutputView (intermediate component)
function JsonInputOutputView({ parsedInput, parsedOutput, ... }) {
  return (
    <>
      <PrettyJsonView title="Input" json={parsedInput} currentView="pretty" />
      <PrettyJsonView title="Output" json={parsedOutput} currentView="pretty" />
    </>
  );
}

// PrettyJsonView.tsx (UI component making domain decisions!)
export function PrettyJsonView({ json, currentView, ... }) {
  // ❌ Detects formats AGAIN
  const isChatML = useMemo(() => isChatMLFormat(json), [json]);
  const { isMarkdown, content } = useMemo(() => isMarkdownContent(json));

  // ❌ Makes rendering decisions
  if (currentView === "json") return <JSONView json={json} />;
  if (isChatML) return null; // Skip table
  if (isMarkdown) return <MarkdownView content={content} />;
  return <JsonPrettyTable data={transformToTable(json)} />;
}
```

**AFTER (Clear Separation):**
```typescript
// IOPreviewPretty.tsx - Domain Layer
export function IOPreviewPretty({ input, output, viewMode, ... }) {
  // ✅ Domain logic ONCE
  const { canDisplayAsChat, allMessages, ... } = useChatMLParser(input, output, ...);
  const shouldRenderMarkdown = useMemo(() => estimateSize(...));

  // ✅ Clear rendering decision
  if (canDisplayAsChat && shouldRenderMarkdown) {
    return <ChatMessageList messages={allMessages} />;
  }

  if (isMarkdown) {
    return <MarkdownView content={markdownContent} />;
  }

  // ✅ Delegate to specialized router
  return <IODataViewer
    input={parsedInput}
    output={parsedOutput}
    viewMode={viewMode}
    media={media}
    expansionState={expansionState}
    onExpansionChange={onExpansionChange}
  />;
}

// IODataViewer.tsx - Coordination Layer
export function IODataViewer({ input, output, viewMode, ... }) {
  const Viewer = viewMode === "json" ? JSONViewer : TableViewer;

  return (
    <>
      {input && <Viewer title="Input" data={input} ... />}
      {output && <Viewer title="Output" data={output} ... />}
      {media && <MediaSection media={media} />}
    </>
  );
}

// JSONViewer.tsx / TableViewer.tsx - Presentation Layer
export function JSONViewer({ data, ... }) {
  // ✅ Pure rendering, no domain logic
  return <ReactObjView data={data} ... />;
}
```

### Example 2: Metadata (Simpler)

**BEFORE:**
```typescript
<PrettyJsonView
  title="Metadata"
  json={trace.metadata}
  currentView={currentView}
  externalExpansionState={expansionState.metadata}
  onExternalExpansionChange={(exp) => setFieldExpansion("metadata", exp)}
/>
```

**AFTER:**
```typescript
<MetadataViewer
  title="Metadata"
  data={trace.metadata}
  viewMode={viewMode}
  expansionState={expansionState.metadata}
  onExpansionChange={(exp) => setFieldExpansion("metadata", exp)}
/>
```

### Example 3: Tool Arguments (Simplest)

**BEFORE:**
```typescript
<PrettyJsonView
  json={toolCall.args}
  currentView="pretty"  // Why specify if always the same?
  codeClassName="border-none p-1"
/>
```

**AFTER:**
```typescript
<SimpleDataViewer
  data={toolCall.args}
  className="border-none p-1"
/>
```

---

## Benefits

### Performance
- **DOM Nodes:** 139,910 → ~500-2,000 (99% reduction)
- **Render Time:** 900-1500ms → 50-150ms (10-20x faster)
- **Memory:** ~30MB → ~2-5MB (85-90% reduction)
- **Scrolling:** Janky → Smooth 60fps

### Code Quality
- **Clear Separation:** Domain ↔ Presentation cleanly separated
- **No Duplication:** Format detection once, no duplicate rendering logic
- **Single Responsibility:** Each component has ONE job
- **Testability:** Pure components easy to test, domain logic isolated
- **Type Safety:** Specific, minimal props (no 20-prop interfaces)

### Maintainability
- **Easy to Find:** Know where decisions are made vs where rendering happens
- **Easy to Change:** Modify rendering without affecting detection logic
- **Easy to Optimize:** Can optimize JSONViewer/TableViewer independently

---

## Next Steps

See [MIGRATION.md](./MIGRATION.md) for phased rollout strategy and [COMPONENTS.md](./COMPONENTS.md) for detailed component specifications.
