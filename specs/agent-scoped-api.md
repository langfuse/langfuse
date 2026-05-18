# Mark API keys for in-app agent usage

**Context**

Public API keys currently encode only entity scope (`PROJECT` or `ORGANIZATION`) and auth style. We need a way to persist that a key is intended for the in-app agent so API auth can apply a narrower allowed surface for that key.

This is not a general user-facing API key permissions feature. Users also need configurable API key permissions eventually, but this work only ships the key marker and enforcement path required for the in-app agent.

**Scope**

Implement persisted in-app agent key identification:

- Add a field on `ApiKey` that identifies a key as usable by the in-app agent, e.g. `isInAppAgentKey Boolean @default(false)`
- Thread the in-app agent marker through shared auth/cache types and auth resolution
- Enforce the in-app agent restriction across public API routes
- Enforce the in-app agent restriction for MCP tool execution

Keep existing key-management UI behavior unchanged:

- Existing tRPC key creation/update flows should continue to create normal API keys
- No UI work is required for creating in-app agent keys
- In-app agent keys should not appear in normal API key management surfaces

**Behavior**

- In-app agent keys may access non-mutating public API operations only
- In-app agent keys must be blocked from all mutating public API operations
- In-app agent keys must be filtered out from public API key listing/read endpoints intended for user-managed keys
- In-app agent keys must be filtered out from UI/tRPC API key listing/read paths intended for user-managed keys
- REST enforcement can generally follow route method semantics (`GET` allowed, mutating methods denied), with any route-specific exceptions handled explicitly
- MCP must not rely on HTTP method, since both reads and writes use `POST`
- For MCP, allow agent-safe inspection tools and block mutating tools based on tool metadata / execution-time checks

**Implementation Notes**

- Add the in-app agent marker field to the `ApiKey` Prisma model and migration
- Update shared cached/auth representations so the marker is available everywhere auth is evaluated
- Update API key repository/list helpers to exclude in-app agent keys by default from user-managed key responses
- Update centralized public API auth/route helpers to reject mutating requests for in-app agent keys
- Patch any manual-auth public API routes that bypass the shared helper
- In MCP, enforce in-app agent behavior at tool registration or tool execution level using existing non-mutating/destructive tool hints
- In existing tRPC project/org API key creation flows, ensure the in-app agent marker defaults to `false`

**Out of Scope**

- UI for selecting in-app agent key behavior
- General user-facing API key permissions
- New provisioning workflow for creating in-app agent keys unless required by the calling integration
- Broader permissions model beyond the in-app agent marker
