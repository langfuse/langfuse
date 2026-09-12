## AI Gateway

### Implementation

- performance of the `/resolve` API path is critical - ideally stays under 10ms
- no tautological frontend component tests that check stuff like height / width

### Testing

- When changing the core flow or model provider-specifics: ensure that the end-to-end test suite
  remains valid: `web/src/__e2e__/ai-gateway.gatewaye2e.ts`
