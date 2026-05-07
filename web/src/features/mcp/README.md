# Langfuse MCP Server

Model Context Protocol (MCP) server for Langfuse, enabling AI assistants to interact with your Langfuse prompts programmatically.

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

4. **Verify**
   In Claude Code: `List all prompts in the project`

---

## Available Tools

The MCP server provides 6 tools for prompt management:

- **`getPrompt`** - Fetch a specific prompt by name with optional label or version (fully resolved with dependencies)
- **`getPromptUnresolved`** - Fetch a specific prompt WITHOUT resolving dependencies (useful for prompt composition analysis)
- **`listPrompts`** - List all prompts in the project with filtering (name/label/tag/updatedAt range) and pagination
- **`createTextPrompt`** - Create a new text prompt version
- **`createChatPrompt`** - Create a new chat prompt version (OpenAI-style messages)
- **`updatePromptLabels`** - Add/move labels across prompt versions

**Implementation:** See [`/web/src/features/mcp/features/prompts/tools/`](/web/src/features/mcp/features/prompts/tools/) for detailed schemas, parameters, and examples for each tool.

### Prompt Resolution: `getPrompt` vs `getPromptUnresolved`

Langfuse supports **prompt composition** where prompts can reference other prompts via dependency tags like `@@@langfusePrompt:name=xxx|label=yyy@@@`. The MCP server provides two tools for fetching prompts with different resolution behaviors:

#### `getPrompt` (Fully Resolved)
- **Use when**: You want the final, executable prompt ready to send to an LLM
- **Behavior**: Recursively resolves all dependency tags by fetching and inserting referenced prompts
- **Returns**: Final prompt content with all dependencies replaced
- **Example**:
  ```
  Input:  "You are helpful. @@@langfusePrompt:name=base-rules|label=production@@@"
  Output: "You are helpful. Always be kind and respectful."
  ```

#### `getPromptUnresolved` (Raw)
- **Use when**: You want to analyze prompt composition, debug dependencies, or understand the prompt structure
- **Behavior**: Returns raw prompt content with dependency tags intact
- **Returns**: Original prompt content with `@@@langfusePrompt:...@@@` tags preserved
- **Example**:
  ```
  Input:  "You are helpful. @@@langfusePrompt:name=base-rules|label=production@@@"
  Output: "You are helpful. @@@langfusePrompt:name=base-rules|label=production@@@"
  ```

**Use Cases for `getPromptUnresolved`**:
- Understanding how prompts compose together (prompt stacking)
- Debugging dependency chains before execution
- Analyzing prompt structure and references
- Building tools that manage prompt composition

---

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

- **`readOnly: true`**: Safe operations that don't modify data (getPrompt, listPrompts)
- **`destructive: true`**: Operations that create/modify data (createTextPrompt, createChatPrompt, updatePromptLabels)

Clients like Claude Code can use these annotations to:

- Auto-approve read-only operations
- Require user confirmation for destructive operations

### Audit Logging

All write operations (createTextPrompt, createChatPrompt, updatePromptLabels) automatically create audit log entries with before/after snapshots.

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
