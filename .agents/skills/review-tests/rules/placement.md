# placement — axioms 6, 8

Is this test at the cheapest layer that can hold it, and does its setup fit what
it proves?

## Axioms

**1 (axiom 6). Prefer the lowest layer that exercises the logic.** Integration
tests are for wiring — that the pieces are connected, the transport carries the
shape, the migration applies. Branch logic, parsing, arithmetic, and formatting
belong in a unit test that runs in milliseconds without Postgres, ClickHouse, or
Redis.

**2 (axiom 8). Setup complexity is a signal.** When the fixture is larger than
the code under test, the test is usually proving the fixture. Either the seam is
wrong or the assertion is smaller than the scaffolding implies.

## Repository layers

Cheapest first:

1. `*.test.ts` in `packages/shared/**`, `worker/**` — plain unit, no services.
2. `web/**/*.clienttest.ts(x)` — jsdom, no services.
3. `web/src/__tests__/server/unit/**/*.servertest.ts` — node, no database.
4. `*.servertest.ts` with a database — Postgres and ClickHouse per
   `vitest-test-db-setup.ts`; the slowest layer by a wide margin.

## Flag

- **axiom 6** — a `*.servertest.ts` in a database project whose assertion is
  about a pure function's output: a formatted string, a parsed filter, a mapped
  DTO, an arithmetic result. Name the unit layer and the function it would call
  directly.
- **axiom 6** — the test creates an org, project, and API key
  (`createOrgProjectAndApiKey`), writes traces or observations, then asserts on
  something computed before any query ran.
- **axiom 6** — the test round-trips through ClickHouse or Prisma only to read
  back a value it just wrote, with no query logic of ours in between.
- **axiom 8** — the fixture (arrange block, factory calls, seeded rows, mock
  wiring) is several times the size of the behaviour asserted, and the
  assertions are one or two shallow checks.
- **axiom 8** — the test mocks so much of the system that what remains under
  test is a single branch, which a direct call would reach with no mocks.

## Do not flag

- Integration tests whose subject **is** the wiring: a queue consumer picking up
  a real job, a migration applying, an API route's status code and body, RBAC
  and tenant isolation, a repository's generated SQL against a real engine.
- Anything asserting project-scoped isolation. That must run against a real
  database; cross-tenant leaks are exactly what a mocked layer cannot catch.
- ClickHouse query-shape tests. The engine's behaviour is the contract there.
- A heavy fixture that a seeder scenario provides
  (`packages/shared/scripts/seeder/`) — the cost is already amortised.
- A large fixture that is genuinely the input: a real OTel payload, a provider
  response body, a long trace to be normalised. Size is the test case.
- Tests at a higher layer because the lower seam does not exist yet and creating
  it is a production refactor. Note it, do not flag it.
- E2E and storybook projects.

## Evidence

Read the test's `file` path against the layer list to place it. Assertions and
`imports` in the evidence show what it actually touches; use those rather than
guessing from the name.

## Verdict

- `rewrite` — the same behaviour is provable at a named cheaper layer; say which
  function to call and which fixture drops away.
- `comment` — the layer is wrong but moving it needs a production seam that does
  not exist.
- Never `delete` on placement alone. A misplaced test still catches a bug;
  deleting it is `uniqueness`'s call.
