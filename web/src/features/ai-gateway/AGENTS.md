## AI Gateway

### Implementation

- performance of the `/resolve` API path is critical - ideally stays under 10ms
- no tautological frontend component tests that check stuff like height / width
- never read or write the gateway's spend Redis keyspace (`gateway-spend:*`); it belongs to the Rust gateway. Spend shown in the control plane comes from ClickHouse.

### Testing

- When changing the core flow or model provider-specifics: ensure that the end-to-end test suite remains valid: one suite per provider in `web/src/__e2e__/ai-gateway/`, all run by the single `test-ai-gateway-e2e` CI job. Each suite adds the provider connection, starts the built binary, lists models, and checks that completions are ingested with model, usage and cost. Shared setup lives in `gatewayE2eHarness.ts`.
