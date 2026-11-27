# Which test to run

Vitest filters on the filename argument. Pass paths relative to the package
the script runs in. For web, `src/__tests__/auth-sign-in-page.clienttest.tsx`
is right; `web/src/...` is wrong.

Run binaries through `pnpm`. Do not call `./node_modules/.bin/*`.

Quote summary lines in the verification report. For turbo lint and
typecheck, also quote `Cached:`. A cached success can be another branch.
Force a real run with `pnpm exec turbo run <task> --force`. `--no-cache`
only skips writing the result.

## By area

| Change | Command |
| --- | --- |
| `.agents/**` skills or AGENTS.md | `pnpm run agents:sync` then `pnpm run agents:check` |
| `web/**` UI or tRPC, not the full suite | `pnpm --filter web run test <file>` for `*.servertest.ts`; `pnpm --filter web run test-client <file>` for `*.clienttest.tsx` |
| `web/**` in-source utility | `pnpm --filter web run test:in-source <file>` |
| `worker/**` | `pnpm --filter worker run test <file>` |
| `packages/shared/**` non-schema | one targeted web test and one targeted worker test, plus lint of the touched package |
| `packages/shared/prisma/**` or `clickhouse/**` | `pnpm run db:generate` and a targeted web or worker regression |
| Public API contract (`web/src/pages/api/public/**`, `fern/apis/**`) | targeted server API test, Fern regeneration, `pnpm run openapi:check` |
| `packages/native/**` | `pnpm --filter @langfuse/native run lint`, then build, then `pnpm --filter worker run typecheck`, then the worker `nativeHello` test |

Package lint is `pnpm --filter <pkg> run lint`. ESLint is `--max-warnings 0`.

`pnpm exec knip` is a CI check with no package script. Run it when the diff
adds or removes files or exports under `web/**`, `packages/shared/**`, or
`worker/**`.

## E2E

```bash
pnpm --filter web run test:e2e -- src/__e2e__/<spec>.ts
```

Playwright's `webServer` runs `npm run dev` and, when `CI` is unset, reuses
whatever already listens on port 3000. The e2e script loads `.env.test`
(`langfuse_test`) and then `.env`. The Cursor Cloud stack on port 3000 uses
the dev database. Reusing it makes specs talk to the wrong database.

Drive the seeded Cloud app in the browser instead of `test:e2e` while that
stack owns port 3000. Run `test:e2e` when port 3000 is free, or in CI where
Playwright starts its own server. Do not set `CI=true` to force a second
server onto a port the Cloud stack already holds.

Server tests that call the public API over HTTP need a web server on port
3000 pointed at `.env.test`. `pnpm run dev:web` loads `.env` only. Start that
server with `pnpm exec dotenv -e .env.test -e .env -- pnpm --filter web run dev`,
and only when port 3000 is free.

## What not to run

- The whole `pnpm --filter web run test` suite to prove a one-file fix.
- A new test whose only assertion restates the diff.
- `pnpm run dx` as a test setup. It deletes local volumes.
