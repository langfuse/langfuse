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

### Stateless Design

The Langfuse MCP server uses a **stateless per-request architecture**:

1. **Fresh server instance per request:** Each MCP request creates a new server instance
2. **Context captured in closures:** Authentication context is captured in handler closures
3. **No session storage:** Server is discarded after request completes
4. **No state between requests:** Each request is independent

This design:

- Eliminates session management complexity
- Prevents state leaks between projects
- Simplifies authentication (project context derived from API key)

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

Tools include hints for clients about their behavior:

- **`readOnlyHint: true`**: Safe operations that don't modify data
- **`destructiveHint: true`**: Operations that modify data in ways that are non-revertable. If an operation only creates entities, without updating existing, it can omit this.

Clients like Claude Code can use these annotations to:

- Auto-approve read-only operations
- Require user confirmation for destructive operations

### Audit Logging

All write operations should audit-log entries with before/after snapshots.

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
