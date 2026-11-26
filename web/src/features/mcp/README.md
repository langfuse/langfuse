# Langfuse MCP Server

Model Context Protocol (MCP) server for Langfuse, enabling AI assistants to interact with Langfuse programmatically.

A complete list of tools can be seen under [mcp.reference.langfuse.com](https://mcp.reference.langfuse.com).

> ⚠️ **API stability**:
> This MCP server is self-describing. Clients should dynamically inspect available tools and schemas rather than assuming a static interface.
> Tool availability and schemas may evolve over time, including the addition, removal, or modification of tools and fields. Clients are expected to tolerate schema changes and refresh capabilities dynamically.

## Quick Start (Local Development)

### Prerequisites

- Langfuse instance running locally
- Project-scoped API key (Public Key + Secret Key)
- Claude Code or another MCP-compatible client

### Steps

1. **Get API Keys**
   - Navigate to `http://localhost:3000/project/{project-id}/settings`
   - Create or copy a project-scoped API key (`pk-lf-...` and `sk-lf-...`)
   - Note: Organization-level keys are not supported

2. **Encode Credentials**

   ```bash
   echo -n "pk-lf-xxx:sk-lf-xxx" | base64
   ```

   Output:

   ```
   // Example. Real token will be much longer
   cGstbGYteHh4OnNrLWxmLXh4eA==
   ```

3. **Add to Claude Code**

   ```bash
   claude mcp add --transport http langfuse http://localhost:3000/api/public/mcp \
       --header "Authorization: Basic {your-base64-token}"
   ```

4. **Verify prompt access**
   In Claude Code: `List all prompts in the project`

5. **Verify observation access**
   In Claude Code: `List recent Langfuse observations`

## Architecture

MCP requests are limited to 4.5 MB and 50,000 object members/array elements combined.

Each feature module (`server/<feature>/index.ts`) lists its tools; `MCP_FEATURES` in `server/tools.ts` lists the features the server offers.

### Stateless Design

The Langfuse MCP server uses a **stateless per-request architecture**:

1. **Fresh server instance per request:** Each MCP request creates a new `McpServer` (`createMcpServer`)
2. **Context captured in closures:** Authentication context is captured in handler closures
3. **No session storage:** Server is discarded after request completes
4. **No state between requests:** Each request is independent

This design:

- Eliminates session management complexity
- Prevents state leaks between projects
- Simplifies authentication (project context derived from API key)

`server/transport.ts` serves both protocol eras through the SDK's `createMcpHandler`: 2026-07-28 requests are answered directly (JSON unless a tool streams), 2025-era requests through its stateless legacy fallback, which always responds with SSE (`text/event-stream`).

Resources are served by the SDK: the bundled Langfuse skills through its Skills extension (`langfuseSkills`: `skills/list`, `skills/get`, and `resources/read` on `skill://langfuse/...`), and the MCP App page `ui://langfuse/widget.html` with `registerAppResource`. The transport counts every `resources/read` (`recordResourceRead`) as `langfuse.mcp.resource_read`, tagged by kind, URI and outcome.

### Authentication Flow

```
1. Client sends request with Authorization header
   ↓
2. API endpoint validates BasicAuth (PUBLIC_KEY:SECRET_KEY)
   ↓
3. Verify API key has project-level scope
   ↓
4. Build ServerContext from API key metadata
   ↓
5. Create fresh MCP server with context in closure
   ↓
6. Handle request (context auto-injected to handlers)
   ↓
7. Discard server instance
```

**ServerContext:**

```typescript
{
  projectId: "proj-123",      // Auto-injected from API key
  orgId: "org-456",           // Auto-injected from API key
  apiKeyId: "key-789",        // For audit logging
  accessLevel: "project",     // Required for MCP
  publicKey: "pk-lf-..."      // For reference
}
```

### Tool Annotations

Tools include hints for clients about their behavior, set through the `annotations` option of `defineTool`. It takes the MCP spec's `ToolAnnotations` (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and publishes them as given:

- **`readOnlyHint: true`**: Safe operations that don't modify data
- **`destructiveHint: true`**: Operations that modify data in ways that are non-revertable. If an operation only creates entities, without updating existing, it can omit this.

Clients like Claude Code can use these annotations to:

- Auto-approve read-only operations
- Require user confirmation for destructive operations

### Audit Logging

All write operations should audit-log entries with before/after snapshots.

Tools that return trace, observation, score or experiment data declare `accessAudit` on `defineTool` and report the returned rows through the handler's `audit` argument (`audit.refs`, `audit.count`). Each successful call is then recorded as an access event (`surface = mcp`, the tool name as route) for orgs that record access events, before the result is returned.

### MCP Apps

`renderWidget` is an [MCP App](https://github.com/modelcontextprotocol/ext-apps): hosts that support the extension (Claude, ChatGPT, …) render its result as an interactive chart next to the tool call. Hosts without support only show the text result.

How a call flows:

1. The model calls `renderWidget` (`server/apps/tools/renderWidget.ts`). The server runs the same query a dashboard tile runs and returns a text summary for the model (`widgetSummary.ts`) plus the widget definition and rows in the result's `_meta.widget`, which hosts keep away from the model.
2. The tool definition points at `ui://langfuse/widget.html` (`ui` option of `defineTool`). The host reads that resource (`server/apps/resources.ts`, registered with `registerAppResource`) and loads it into a sandboxed iframe.
3. The view (`views/widget/WidgetApp.tsx`) connects to the host with the `@modelcontextprotocol/ext-apps` SDK, receives the tool result and renders the dashboard's `WidgetChartCard`.
4. When the host proxies tool calls (`serverTools` capability) and has sent the call's arguments (`toolinput`), a toolbar above the card shows the dashboard's `TimeRangePicker` and a refresh button. Both call `renderWidget` again through the host (`app.callServerTool`) with the original arguments and the chosen window (`timeRange` for a preset, `fromTimestamp`/`toTimestamp` for a calendar range), and render that result in place. Picking another window while a call runs cancels it (an aborted `signal`, which the host is told about). The host sizes the frame to the document, so the view adds height while the picker's popover is open. The model does not see these calls, so the view passes the new text summary to the host with `updateModelContext`, which hosts add to the user's next message.

The view is an ordinary Next.js page, `/mcp-apps/widget` (`src/app/mcp-apps`), built and deployed with the app. The server fetches that page's HTML from itself and returns it as the resource. The host's sandboxed iframe then loads the page's scripts and styles from Langfuse:

- `_meta.ui.csp` declares Langfuse (and `NEXT_PUBLIC_ASSET_PREFIX`, when set) as `resourceDomains` and `connectDomains` (devtools fetch source maps from there); hosts block every other origin.
- The iframe's origin is the host's, so the page's root-relative `/_next/` URLs (in tags and in the inline RSC payload) are rewritten to absolute Langfuse URLs, and an inline script sets Turbopack's chunk base path. Plain `<script>` and stylesheet tags load across origins without CORS; with `NEXT_PUBLIC_ASSET_PREFIX`, Next adds `crossorigin`, so that asset host must send `Access-Control-Allow-Origin: *`.
- Hosts only allow public HTTPS origins in the iframe CSP (Claude drops `http://localhost`), so a local dev server renders an empty widget there. To try it locally, serve the dev server on a public HTTPS hostname (for example a tunnel) and set `NEXTAUTH_URL` to it. `allowedDevOrigins` lets the hosts' sandbox origins load dev assets.

The server declares the `io.modelcontextprotocol/ui` extension. App tools (and their `ui://` resources) are left out of discovery for clients that declare capabilities without it, which only 2026-07-28 clients do on every request. 2025-era clients declare capabilities only in `initialize`, which the stateless endpoint does not keep, so they still see app tools, which answer in text everywhere. The in-app agent never gets them (`apps/index.ts`).

Hosts may cache the resource per conversation, so check view changes in a new one.

A host sends a view its tool result once. A view that starts again in the same frame, such as after a hot update while developing it, gets no result: after 30 seconds without one (or on `tool-cancelled`) it shows Retry. When the host sent no arguments either, Retry posts a request for the chart to the chat (`app.sendMessage`, when the host supports `message`), and the model draws a new one.

### Notebooks

Use `list_notebooks` and `get_notebook` to discover notebooks and their document indexes. `read_document` reads the latest published version by default; pass `version` for a historical version or `staged: true` for a draft. A notebook that has never been published requires `staged: true`.

`create_notebook` creates a draft with a `main` document. Its top-level `layout` is `default` (only `main`), `inbox`, or `tabs`. To write a body with `write_document`, pass exactly one of `markdown`, `blocks`, or `jsonl`, plus `documentId` to replace an existing document. To add a document to Inbox or Tabs, pass a `label` instead of `documentId`; the tool generates an ID and adds it to the layout.

Each document has a versioned `width`: `contained` (the default) or `full` (the available reader width, with padding). Set it when writing a body, or pass only `notebookId`, `documentId`, and `width` to change it without editing the body. Omitting `width` preserves the existing setting.

To change the layout, order, or labels, call `update_notebook_layout`. For example: `{kind: "tabs", documents: [{documentId: "main", label: "Overview"}]}`. Layout changes do not delete documents or modify published versions. Include all draft documents in the layout before publishing. Layouts are not document blocks.

`validate_notebook` reports missing references and unreachable documents by ID. Fix those errors before calling `publish_notebook`. Pass `documentId` to check only that document's body. When omitted from `read_document` and `patch_document`, `documentId` still defaults to `main`.

For mixed content, write an array of blocks such as `{schema: "text@1", markdown: "## Summary"}`, `{schema: "row@1", props: {children: [...]}}`, or `{schema: "chart@1", props: {query: {schema: "metrics@2", ...metricsQuery}, display: {kind: "line"}}}`. A line chart requires a Metrics V2 `timeDimension`. Omit block IDs to generate them; use those IDs to patch nested blocks later.

For a KPI, use `display: {kind: "big-number", format: {style: "decimal"}}` with exactly one metric, `dimensions: []`, and `timeDimension: null`. Use `{style: "percent"}` for fractional values (e.g. `0.923` renders as `92.3%`) or `{style: "currency", currency: "USD"}` for currency. `display.caption` is optional.

`/project/<projectId>/notebooks/<notebookId>` opens the latest saved layout, including unpublished changes, at its first reachable document. Append `/<documentId>` to open a document in the latest published version. Append `?version=N` to either route to pin a published snapshot and its layout. To open a specific draft document, append `?draftDocument=<documentId>` to the notebook URL. Passing `sourceVersion` to `publish_notebook` republishes that snapshot without discarding unpublished edits.

Notebook tools are only listed and callable by Halo. Reads and validation require `notebooks:read`; mutations require `notebooks:CUD` and Halo approval. Notebook calls require a resolved project API key policy. `API_AUTH_MIGRATION=enforce` (the default) supplies it; `shadow` supplies it only when both auth paths succeed. Explicit `legacy` mode does not expose these tools. Mutation audit entries include the actor and resource IDs, not the document body. Halo uses its temporary API key to group edits within its run.

---

# Connecting Clients

## Authentication

All clients require BasicAuth authentication using your Langfuse API keys.

### 1. Generate Basic Auth Token

Encode your Langfuse API keys (Public Key:Secret Key) to base64:

```bash
echo -n "pk-lf-your-public-key:sk-lf-your-secret-key" | base64
```

This outputs your BasicAuth token (e.g., `cGstbGYt...`).

### 2. Choose Your Langfuse URL

**Langfuse Cloud:**

- **EU Region:** `https://cloud.langfuse.com`
- **US Region:** `https://us.langfuse.com`
- **HIPAA:** `https://hipaa.langfuse.com`

**Self-Hosted:**

- Use your domain with HTTPS: `https://your-domain.com`
- If a reverse proxy forwards a different `Host` header than `NEXTAUTH_URL`,
  either preserve the public host at the proxy or set
  `LANGFUSE_MCP_ALLOWED_HOSTS` to a comma-separated list of exact additional
  hostnames/origins accepted by the MCP endpoint. Wildcard host patterns and
  paths are not supported. To disable Host and Origin validation completely, set
  `LANGFUSE_MCP_ALLOWED_HOSTS=*`. This is not recommended because it disables
  DNS rebinding protection for the MCP endpoint.

**Local Development:**

- `http://localhost:3000`

---

## Claude Code

Register the Langfuse MCP server:

```bash
# Langfuse Cloud (EU)
claude mcp add --transport http langfuse https://cloud.langfuse.com/api/public/mcp \
    --header "Authorization: Basic {your-base64-token}"

# Langfuse Cloud (US)
claude mcp add --transport http langfuse https://us.langfuse.com/api/public/mcp \
    --header "Authorization: Basic {your-base64-token}"

# Self-Hosted (HTTPS required)
claude mcp add --transport http langfuse https://your-domain.com/api/public/mcp \
    --header "Authorization: Basic {your-base64-token}"

# Local Development
claude mcp add --transport http langfuse http://localhost:3000/api/public/mcp \
    --header "Authorization: Basic {your-base64-token}"
```

---

## Cursor

Add to your Cursor MCP settings:

```json
{
  "mcp": {
    "servers": {
      "langfuse": {
        "url": "https://cloud.langfuse.com/api/public/mcp",
        "headers": {
          "Authorization": "Basic {your-base64-token}"
        }
      }
    }
  }
}
```

Replace `https://cloud.langfuse.com` with your Langfuse URL (see [Choose Your Langfuse URL](#2-choose-your-langfuse-url)).
