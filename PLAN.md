Sandbox plan

1. Reuse `InAppAgentConversation.providerSessionId` as the sandbox handle. Add only the extra conversation fields we need: `sandboxSnapshotKey`, `sandboxExpiresAt`, and `sandboxProvider`.
2. Keep the sandbox code small and local to the in-app agent under `web/src/ee/features/in-app-agent/server/sandbox/`.
3. Add four Mastra tools in `createMastraAdapter(...)`: `read`, `write`, `edit`, and `bash`.
4. Each sandbox tool resolves the conversation sandbox first:
   - reuse an active sandbox
   - restore from snapshot if the sandbox expired
   - otherwise create a fresh sandbox
5. Before each sandbox tool call, rebuild the sandbox `tool_calls/` directory from persisted non-sandbox tool calls in the conversation. Rewrite the full directory each time.
6. Keep sandboxes alive for a TTL after each turn. When the sandbox expires, suspend it and store its filesystem in object storage so it can be revived later.
7. Delete stored sandbox snapshots after the project retention period or when the user account is deleted.
8. Use a small provider abstraction so sandbox provisioning stays out of the main agent implementation. Start with:
   - a production AWS Lambda MicroVM provider
   - a local dangerous Docker provider backed by `dockerode`
9. Enforce the RFC security rules in both providers:
   - no outbound network access
   - no credentials injected into the sandbox
   - base image includes Node, Python, and `jq`
10. Add focused tests for:
   - sandbox tools are registered
   - a conversation reuses its sandbox
   - an expired sandbox restores from snapshot
   - `tool_calls/` contains prior non-sandbox tool calls only
