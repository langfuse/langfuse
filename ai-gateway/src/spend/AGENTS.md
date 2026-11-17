`cost.rs`: Logic duplicated with `packages/shared/src/server/pricing-tiers/{matcher,calculateModelUsageCosts}.ts`. Keep logic in sync.
`window.rs`: Logic duplicated with `web/src/features/ai-gateway/server/spendLimits/gatewaySpendLimitWindow.ts`. Keep logic in sync.

After changing the TypeScript cost calculation, regenerate `ai-gateway/tests/fixtures/cost-cases.json`:
`pnpm --filter @langfuse/shared run test gatewayCostFixture -u`.
