# Langfuse MCP Server

Model Context Protocol (MCP) server for Langfuse, enabling AI assistants to interact with your Langfuse prompts programmatically.

## Table of Contents

- [Quick Start](#quick-start)
- [Available Tools](#available-tools)
- [Available Resources](#available-resources)
- [Common Workflows](#common-workflows)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Langfuse instance (local or hosted)
- Project-scoped API key (Public Key + Secret Key)
- Claude Code or another MCP-compatible client

### 1. Get Your API Keys

1. Navigate to your Langfuse project settings
2. Create or copy a **project-scoped API key** (both public key `pk-lf-...` and secret key `sk-lf-...`)
3. Note: Organization-level keys are not supported for MCP

### 2. Encode Your Credentials

MCP uses HTTP BasicAuth. Encode your keys in the format `PUBLIC_KEY:SECRET_KEY`:

```bash
echo -n "pk-lf-df1fb7b5-b644-45f4-8149-053d4d1cd1a5:sk-lf-961dabbe-ae50-434b-9197-854787548dc8" | base64
```

This will output a base64-encoded string like:
```
cGstbGYtZGYxZmI3YjUtYjY0NC00NWY0LTgxNDktMDUzZDRkMWNkMWE1OnNrLWxmLTk2MWRhYmJlLWFlNTAtNDM0Yi05MTk3LTg1NDc4NzU0OGRjOA==
```

### 3. Add to Claude Code

Register the Langfuse MCP server with Claude Code:

```bash
claude mcp add --transport http langfuse http://localhost:3000/api/public/mcp \
    --header "Authorization: Basic cGstbGYtZGYxZmI3YjUtYjY0NC00NWY0LTgxNDktMDUzZDRkMWNkMWE1OnNrLWxmLTk2MWRhYmJlLWFlNTAtNDM0Yi05MTk3LTg1NDc4NzU0OGRjOA=="
```

**For Langfuse Cloud:**
- EU Region: `https://cloud.langfuse.com`
- US Region: `https://us.langfuse.com`
- HIPAA: `https://hipaa.langfuse.com`

**For Self-Hosted Deployments:**
Replace with your domain using `https://` (HTTPS required).

### 4. Verify

In Claude Code, you should now be able to:

```
List all prompts in the project
```

Claude will use the `listPrompts` tool to fetch your prompts.

---

## Available Tools

The Langfuse MCP server provides 5 tools for prompt management:

### 1. `getPrompt`

**Description:** Fetch a specific prompt by name with optional label or version.

**Annotation:** `readOnly` (safe, non-destructive)

**Parameters:**
- `name` (required): Prompt name
- `label` (optional): Get prompt with specific label (e.g., "production", "staging")
- `version` (optional): Get specific version number (e.g., 1, 2, 3)

**Note:** `label` and `version` are mutually exclusive. If neither is specified, defaults to the "production" label.

**Examples:**

```typescript
// Get production version (default)
{
  name: "chatbot"
}

// Get staging version
{
  name: "chatbot",
  label: "staging"
}

// Get specific version
{
  name: "chatbot",
  version: 3
}
```

**Returns:**
```json
{
  "id": "prompt-id",
  "name": "chatbot",
  "version": 2,
  "type": "text",
  "prompt": "You are a helpful AI assistant...",
  "labels": ["production"],
  "tags": ["customer-facing"],
  "config": {
    "model": "gpt-4",
    "temperature": 0.7
  },
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z",
  "createdBy": "user@example.com",
  "projectId": "proj-123"
}
```

---

### 2. `listPrompts`

**Description:** List all prompts in the project with optional filtering and pagination.

**Annotation:** `readOnly` (safe, non-destructive)

**Parameters:**
- `name` (optional): Filter by exact name match
- `label` (optional): Filter by label (exact match)
- `tag` (optional): Filter by tag (exact match)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 50, max: 100)

**Examples:**

```typescript
// List all prompts (paginated)
{
  page: 1,
  limit: 50
}

// Filter by label
{
  label: "production",
  page: 1,
  limit: 50
}

// Filter by tag
{
  tag: "experimental",
  page: 1,
  limit: 50
}

// Exact name match
{
  name: "chatbot",
  page: 1,
  limit: 50
}
```

**Returns:**
```json
{
  "data": [
    {
      "id": "prompt-id",
      "name": "chatbot",
      "version": 2,
      "type": "text",
      "labels": ["production"],
      "tags": ["customer-facing"],
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "totalItems": 125,
    "totalPages": 3
  }
}
```

---

### 3. `createTextPrompt`

**Description:** Create a new text prompt version in Langfuse.

**Annotation:** `destructive` (creates database records)

**Important:** Always confirm with user before executing.

**Parameters:**
- `name` (required): Prompt name
- `prompt` (required): Text content (supports `{{variables}}`)
- `labels` (optional): Array of labels (e.g., `["production", "staging"]`)
- `config` (optional): JSON config object (e.g., `{model: "gpt-4", temperature: 0.7}`)
- `tags` (optional): Array of tags (e.g., `["experimental", "v2"]`)
- `commitMessage` (optional): Commit message describing changes

**Key Behaviors:**
- Prompts are **immutable** once created - you cannot modify existing versions
- To "update" content, create a new version
- First version automatically gets "latest" label
- Use `updatePromptLabels` to promote versions (e.g., staging → production)
- Labels are unique across versions (setting "production" on v3 removes it from v2)

**Template Variables:**

Use `{{variable_name}}` syntax for dynamic content:

```text
Hello {{name}}, welcome to {{service}}!
```

**Examples:**

```typescript
// Simple system prompt
{
  name: "system-instructions",
  prompt: "You are a helpful AI assistant specialized in {{domain}}."
}

// Production prompt with config
{
  name: "code-reviewer",
  prompt: "Review the following {{language}} code for bugs and improvements.",
  labels: ["production"],
  config: {
    model: "gpt-4",
    temperature: 0.3
  },
  commitMessage: "Initial production version"
}

// Versioned prompt with tags
{
  name: "chatbot",
  prompt: "You are a friendly chatbot. User context: {{context}}",
  labels: ["staging"],
  tags: ["experimental", "v2"],
  commitMessage: "Testing new conversational style"
}
```

**Returns:**
```json
{
  "id": "prompt-id",
  "name": "code-reviewer",
  "version": 1,
  "type": "text",
  "labels": ["production", "latest"],
  "tags": [],
  "config": {
    "model": "gpt-4",
    "temperature": 0.3
  },
  "createdAt": "2024-01-15T10:00:00Z",
  "createdBy": "API",
  "message": "Successfully created text prompt 'code-reviewer' version 1 with labels: production, latest"
}
```

---

### 4. `createChatPrompt`

**Description:** Create a new chat prompt version with message array (OpenAI-style).

**Annotation:** `destructive` (creates database records)

**Important:** Always confirm with user before executing.

**Parameters:**
- `name` (required): Prompt name
- `messages` (required): Array of chat messages with roles (system, user, assistant)
- `labels` (optional): Array of labels
- `config` (optional): JSON config object
- `tags` (optional): Array of tags
- `commitMessage` (optional): Commit message

**Message Format:**

Each message must have:
- `role`: "system", "user", or "assistant"
- `content`: Message text (supports `{{variables}}`)

**Examples:**

```typescript
// Simple chat prompt
{
  name: "customer-support",
  messages: [
    {
      role: "system",
      content: "You are a helpful customer support agent for {{company}}."
    },
    {
      role: "user",
      content: "Hello, I need help with {{topic}}."
    }
  ]
}

// Multi-turn conversation template
{
  name: "code-assistant",
  messages: [
    {
      role: "system",
      content: "You are an expert {{language}} developer."
    },
    {
      role: "user",
      content: "I need help with {{problem}}."
    },
    {
      role: "assistant",
      content: "I'd be happy to help. Can you share your code?"
    },
    {
      role: "user",
      content: "{{code}}"
    }
  ],
  labels: ["production"],
  config: {
    model: "gpt-4",
    temperature: 0.5
  }
}
```

**Returns:**
```json
{
  "id": "prompt-id",
  "name": "customer-support",
  "version": 1,
  "type": "chat",
  "labels": ["latest"],
  "tags": [],
  "config": {},
  "createdAt": "2024-01-15T10:00:00Z",
  "createdBy": "API",
  "message": "Successfully created chat prompt 'customer-support' version 1 with labels: latest"
}
```

---

### 5. `updatePromptLabels`

**Description:** Add labels to a specific prompt version. Labels are unique across versions.

**Annotation:** `destructive` (modifies database records)

**Important:** Always confirm with user before executing.

**Parameters:**
- `name` (required): Prompt name
- `version` (required): Version number to label
- `labels` (required): Array of labels to add

**Key Behaviors:**
- **Additive operation:** Adds labels to existing ones (doesn't replace)
- **Labels are unique:** If you add "production" to v3, it's automatically removed from v2
- Use this to promote versions through environments (staging → production)

**Examples:**

```typescript
// Promote version 3 to production
{
  name: "chatbot",
  version: 3,
  labels: ["production"]
}

// Add multiple labels
{
  name: "chatbot",
  version: 4,
  labels: ["staging", "testing"]
}
```

**Returns:**
```json
{
  "id": "prompt-id",
  "name": "chatbot",
  "version": 3,
  "labels": ["production", "latest"],
  "message": "Successfully updated labels for prompt 'chatbot' version 3. Labels: production, latest"
}
```

---

## Available Resources

MCP resources allow direct URI-based access to Langfuse data.

### 1. `langfuse://prompts`

**Description:** List prompts in the project

**Query Parameters:**
- `name`: Partial match on prompt name
- `label`: Exact match on label
- `tag`: Exact match on tag
- `limit`: Results limit (1-250, default 100)
- `offset`: Skip count (default 0)

**Example URIs:**
```
langfuse://prompts
langfuse://prompts?label=production
langfuse://prompts?tag=experimental&limit=50
langfuse://prompts?name=chatbot
```

**Returns:** JSON array of prompt metadata ordered by creation date (newest first).

---

### 2. `langfuse://prompt/{name}`

**Description:** Get a compiled prompt by name

**Query Parameters:**
- `label`: Get prompt with specific label (mutually exclusive with `version`)
- `version`: Get specific version number (mutually exclusive with `label`)

**Default:** Returns "production" label if neither specified.

**Example URIs:**
```
langfuse://prompt/chatbot
langfuse://prompt/chatbot?label=staging
langfuse://prompt/chatbot?version=3
```

**Returns:** Fully compiled prompt with resolved dependencies.

---

## Common Workflows

### Workflow 1: Create a New Prompt

```typescript
// 1. Create initial version
{
  tool: "createTextPrompt",
  name: "welcome-message",
  prompt: "Hello {{user_name}}, welcome to {{app_name}}!",
  labels: ["staging"],
  commitMessage: "Initial version"
}

// 2. Test in staging environment
// ... testing ...

// 3. Promote to production
{
  tool: "updatePromptLabels",
  name: "welcome-message",
  version: 1,
  labels: ["production"]
}
```

---

### Workflow 2: Version and Test Prompts

```typescript
// 1. List current production prompt
{
  tool: "getPrompt",
  name: "chatbot",
  label: "production"
}
// Returns: version 2

// 2. Create new version with improvements
{
  tool: "createTextPrompt",
  name: "chatbot",
  prompt: "Improved version with {{new_feature}}",
  labels: ["staging"],
  commitMessage: "Add new_feature support"
}
// Creates: version 3 with staging label

// 3. Test version 3 in staging
// ... testing ...

// 4. Promote to production (removes from v2)
{
  tool: "updatePromptLabels",
  name: "chatbot",
  version: 3,
  labels: ["production"]
}
```

---

### Workflow 3: Meta-Prompting (AI-Assisted Prompt Development)

Use Claude Code to help develop and refine prompts:

**User:**
```
Create a code review prompt that checks for:
- Security vulnerabilities
- Performance issues
- Code style consistency
- Documentation completeness

Use template variables for language and code.
```

**Claude Code:**
```typescript
{
  tool: "createTextPrompt",
  name: "code-reviewer",
  prompt: `You are an expert code reviewer. Analyze the following {{language}} code and provide feedback on:

1. Security vulnerabilities
2. Performance issues
3. Code style consistency
4. Documentation completeness

Code to review:
{{code}}

Provide specific, actionable feedback with examples.`,
  labels: ["staging"],
  config: {
    model: "gpt-4",
    temperature: 0.3
  },
  commitMessage: "AI-generated code review prompt"
}
```

**Iterative refinement:**
```
The prompt is too generic. Make it more specific for React components.
```

**Claude Code:**
```typescript
{
  tool: "createTextPrompt",
  name: "code-reviewer",
  prompt: `You are an expert React code reviewer. Analyze the following React {{component_type}} and provide feedback on:

1. Security vulnerabilities (XSS, injection attacks)
2. Performance issues (unnecessary re-renders, memo opportunities)
3. React best practices (hooks rules, component composition)
4. TypeScript types and prop validation
5. Accessibility (ARIA labels, keyboard navigation)
6. Documentation (JSDoc, prop descriptions)

Component code:
{{code}}

For each issue found:
- Severity: Critical/High/Medium/Low
- Location: Specific line numbers
- Fix: Code example showing the correction`,
  labels: ["staging"],
  commitMessage: "Specialized for React components"
}
```

---

### Workflow 4: Multi-Environment Deployment

```typescript
// Development
{
  tool: "createTextPrompt",
  name: "feature-x",
  prompt: "Dev version: {{content}}",
  labels: ["dev"]
}

// Staging (new version)
{
  tool: "createTextPrompt",
  name: "feature-x",
  prompt: "Staging version: {{content}}",
  labels: ["staging"]
}

// Production (promote tested version)
{
  tool: "updatePromptLabels",
  name: "feature-x",
  version: 2,  // The staging version
  labels: ["production"]
}
```

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

All write operations (createTextPrompt, createChatPrompt, updatePromptLabels) automatically create audit log entries:

```typescript
{
  action: "create",
  resourceType: "prompt",
  resourceId: "prompt-id",
  projectId: "proj-123",
  orgId: "org-456",
  apiKeyId: "key-789",
  before: null,           // Previous state (null for creates)
  after: { /* new prompt */ }  // New state
}
```

---

## Configuration

### Local Development

```bash
# 1. Start Langfuse locally
pnpm run dev:web

# 2. Create API key in UI
# Navigate to: http://localhost:3000/project/{project-id}/settings

# 3. Encode credentials
echo -n "pk-lf-...:sk-lf-..." | base64

# 4. Add to Claude Code
claude mcp add --transport http langfuse http://localhost:3000/api/public/mcp \
    --header "Authorization: Basic {base64-encoded-credentials}"
```

---

### Production (Langfuse Cloud)

**Langfuse Cloud Regions:**

**EU Region (cloud.langfuse.com):**
```bash
# 1. Get API keys from Langfuse Cloud EU
# Navigate to: https://cloud.langfuse.com/project/{project-id}/settings

# 2. Encode credentials
echo -n "pk-lf-...:sk-lf-..." | base64

# 3. Add to Claude Code
claude mcp add --transport http langfuse https://cloud.langfuse.com/api/public/mcp \
    --header "Authorization: Basic {base64-encoded-credentials}"
```

**US Region (us.langfuse.com):**
```bash
claude mcp add --transport http langfuse https://us.langfuse.com/api/public/mcp \
    --header "Authorization: Basic {base64-encoded-credentials}"
```

**HIPAA (hipaa.langfuse.com):**
```bash
claude mcp add --transport http langfuse https://hipaa.langfuse.com/api/public/mcp \
    --header "Authorization: Basic {base64-encoded-credentials}"
```

**Self-Hosted Deployments:**
```bash
# Replace with your domain (HTTPS required)
claude mcp add --transport http langfuse https://your-domain.com/api/public/mcp \
    --header "Authorization: Basic {base64-encoded-credentials}"
```

**Note:** All production and self-hosted deployments **must use HTTPS**.

---

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "langfuse": {
      "command": "http",
      "args": [
        "http://localhost:3000/api/public/mcp"
      ],
      "env": {
        "AUTHORIZATION": "Basic cGstbGYt..."
      }
    }
  }
}
```

---

### Cursor Configuration

Add to Cursor MCP settings:

```json
{
  "mcp": {
    "servers": {
      "langfuse": {
        "url": "http://localhost:3000/api/public/mcp",
        "headers": {
          "Authorization": "Basic cGstbGYt..."
        }
      }
    }
  }
}
```

---

## Troubleshooting

### Authentication Errors

**Error:** `Access denied: MCP requires project-scoped API keys`

**Solution:**
- Verify you're using a **project-scoped API key** (not organization-scoped)
- Check key format: `pk-lf-...:sk-lf-...` (both parts required)
- Ensure base64 encoding is correct (use `echo -n` to avoid newlines)

**Verify encoding:**
```bash
# Encode
ENCODED=$(echo -n "pk-lf-...:sk-lf-..." | base64)
echo $ENCODED

# Decode to verify
echo $ENCODED | base64 -d
# Should output: pk-lf-...:sk-lf-...
```

---

### Connection Errors

**Error:** `Failed to connect to MCP server`

**Solutions:**
1. Check Langfuse is running: `curl http://localhost:3000/api/health`
2. Verify endpoint path: `/api/public/mcp` (not `/mcp`)
3. Check firewall/network settings
4. For hosted Langfuse, verify URL (include `https://`)

---

### Tool Errors

**Error:** `Prompt 'chatbot' not found`

**Solutions:**
- List prompts to verify name: `{tool: "listPrompts"}`
- Check spelling and case sensitivity
- Verify you're in the correct project

---

**Error:** `Cannot specify both label and version`

**Solution:**
- Use either `label` OR `version`, not both
- Remove one parameter from your request

---

**Error:** `Labels are unique across versions`

**Explanation:**
- This is expected behavior, not an error
- When you add "production" to v3, it's automatically removed from v2
- Use `listPrompts` to see current label distribution

---

### Debugging Tips

**1. List all prompts to see current state:**
```typescript
{
  tool: "listPrompts",
  page: 1,
  limit: 100
}
```

**2. Check specific version:**
```typescript
{
  tool: "getPrompt",
  name: "chatbot",
  version: 3
}
```

**3. Verify API key scope:**
- Navigate to Langfuse UI → Project Settings → API Keys
- Confirm key shows "Project" scope (not "Organization")

**4. Check audit logs in Langfuse UI:**
- Navigate to Project Settings → Audit Logs
- Verify write operations (creates, updates) are logged
- Check for error messages or failed operations

---

## Additional Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Langfuse Documentation](https://langfuse.com/docs)
- [Langfuse Prompt Management](https://langfuse.com/docs/prompts)
- [Claude Code Documentation](https://code.claude.com/docs)

---

## Support

For issues or questions:
- GitHub Issues: [langfuse/langfuse](https://github.com/langfuse/langfuse/issues)
- Discord: [Langfuse Community](https://langfuse.com/discord)
- Documentation: [langfuse.com/docs](https://langfuse.com/docs)
