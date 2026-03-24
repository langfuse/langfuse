# Codex Guidelines for `web`

This file covers package-local guidance for this package.
Use root [AGENTS.md](../AGENTS.md) for monorepo-level rules.

## Purpose
- Next.js 15 application with UI, tRPC backend, and public REST API routes.
- Primary package for frontend and most request/response surface changes.

## Maintenance Contract
- `AGENTS.md` is a living document.
- Update this file in the same PR when material web-local changes occur:
  - new/renamed web entry points
  - new API route families
  - changed web-specific verification commands
- If the change also affects monorepo workflows or other packages, update root
  `AGENTS.md` too.

## High-Signal Entry Points
- App shell/providers: `src/pages/_app.tsx`
- tRPC context/procedures: `src/server/api/trpc.ts`
- tRPC router registry: `src/server/api/root.ts`
- tRPC routers: `src/server/api/routers/*`, `src/features/*/server/*`
- Public REST API routes: `src/pages/api/public/*`
- Internal streaming API routes: `src/pages/api/{dashboard,events}/*`
- Feature modules: `src/features/*`
- Reusable UI components: `src/components/*`
- Tests:
  - Server tests: `src/__tests__/server/*.servertest.ts`
  - Client tests: `src/**/*.clienttest.ts(x)`
  - E2E: `src/__e2e__/*`

## Shared Package Imports

- Prefer `@langfuse/shared` in frontend-safe web code for shared types, zod
  schemas, domain contracts, table definitions, prompt/eval/model-pricing
  helpers, and other cross-runtime utilities.
- Use `@langfuse/shared/src/server` only from server-only web code such as
  `src/server/**`, `src/pages/api/**`, and server tests.
- Use `@langfuse/shared/src/db` only in backend or test code that needs direct
  Prisma access; never route it into client bundles.
- Use narrower subpaths such as `@langfuse/shared/src/env` or
  `@langfuse/shared/encryption` only when that focused surface is the clearest
  dependency.
- See `../packages/shared/AGENTS.md` for the full shared export map and what
  each entrypoint contains.
- For the higher-level platform topology across web, worker, Postgres,
  ClickHouse, Redis, and S3, also read the architecture handbook:
  [langfuse.com/handbook/product-engineering/architecture](https://langfuse.com/handbook/product-engineering/architecture)
  with source markdown in
  `../langfuse-docs/content/handbook/product-engineering/architecture.mdx`
  (GitHub mirror:
  [architecture.mdx](https://github.com/langfuse/langfuse-docs/blob/4188c1ba453240c90a763a8067ef442d68839323/content/handbook/product-engineering/architecture.mdx#L4)).

## Package-Local Skills

- React composition and component API design:
  [`web/.agents/skills/vercel-composition-patterns/SKILL.md`](.agents/skills/vercel-composition-patterns/SKILL.md)
- React/Next.js performance and rendering best practices:
  [`web/.agents/skills/vercel-react-best-practices/SKILL.md`](.agents/skills/vercel-react-best-practices/SKILL.md)

Read these package-local skills before substantial frontend refactors when the
task involves component composition, reusable component APIs, rendering
performance, bundle size, or React/Next.js performance patterns.

## Quick Commands
- Dev: `pnpm --filter web run dev`
- Lint: `pnpm --filter web run lint`
- Lint fix: `pnpm --filter web run lint:fix`
- Typecheck: `pnpm --filter web run typecheck`
- Server tests: `pnpm --filter web run test --testPathPatterns="<pattern>"`
- Client tests: `pnpm --filter web run test-client --testPathPatterns="<pattern>"`
- E2E tests: `pnpm --filter web run test:e2e`
- Agent browser install to the default user-level Playwright cache: `pnpm run playwright:install`
- Build: `pnpm --filter web run build`

## Playbooks

### Add/Change tRPC endpoint
1. Implement router/procedure in `src/server/api/routers/*` or
   `src/features/<feature>/server/*`.
2. Register in `src/server/api/root.ts`.
3. Reuse auth/error patterns from `src/server/api/trpc.ts`.
4. Add/adjust server tests under `src/__tests__/server/*`.

### Add/Change public API endpoint
1. Add route in `src/pages/api/public/*`.
2. Define/update contract types in `src/features/public-api/types/*`.
3. Add/adjust server tests in `src/__tests__/server/*`.
4. If API contract changed, update Fern source (`../fern/apis/**`) and regenerate
   outputs (do not hand-edit `../generated/**`).

### Add frontend feature
1. Prefer `src/features/<feature>/*` for feature-local code.
2. Put broadly reusable components in `src/components/*`.
3. Keep server logic near feature server folders when possible.
4. Review the affected user flow in a real browser with the Playwright MCP server before signoff, including a quick functional pass and a visual regression check. Use the seeded local login `demo@langfuse.com` / `password` when needed.

### Agent browser loop
1. Start the app with `pnpm run dev:web` unless an existing local server is already running.
2. Install Chromium with `pnpm run playwright:install` if Playwright has not been set up on this machine yet.
3. Use the workspace `playwright` MCP server from `.mcp.json` or `.vscode/mcp.json` for browser-driven review of user-visible frontend changes, not just debugging.
4. Exercise the primary changed flow and check the resulting UI state for obvious visual regressions before signoff. The default seeded browser account is `demo@langfuse.com` / `password`, and the main seeded project URL is `http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`.
5. Inspect traces and other artifacts under `../.playwright-mcp/` when a browser session fails.

## Package-Specific Rules
- Router style is Pages Router-centric; follow existing routing patterns.
- Keep tests independent; no reliance on test execution order.
- Confirm the target `*.clienttest.*` or `*.servertest.*` file exists before using `--testPathPatterns`; source files do not always have a matching colocated test file.
- Do not hand-edit build artifacts: `.next/*`, `.next-check/*`, `dist/*`.
