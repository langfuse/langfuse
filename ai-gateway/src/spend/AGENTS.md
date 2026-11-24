`cost.rs`: Logic duplicated with `packages/shared/src/server/pricing-tiers/{matcher,calculateModelUsageCosts}.ts`. Keep logic in sync.
`window.rs`: Logic duplicated with `web/src/features/ai-gateway/fns/gatewaySpendLimitWindow.ts`. Keep logic in sync.

After changing the TypeScript cost calculation, regenerate `ai-gateway/tests/fixtures/cost-cases.json`:
`pnpm --filter @langfuse/shared run test gatewayCostFixture -u`.

Counter keys start with `gateway-spend:`; nothing else may write under that prefix. Total counters never expire, so the Redis must not evict (see README "Budgets").
