# ownership — axioms 2, 3

Is the test asserting on something we own and could break?

## Axioms

**1 (axiom 2). Test the contract, not the implementation.** Assert what a caller
is promised. A test that knows which private helper ran, in what order, or how
many times, fails on every honest refactor and passes when the contract breaks.

**2 (axiom 3). Do not test the type system or the framework.** TypeScript
already proves the field exists. Zod already rejects the wrong shape. Vitest
already calls the callback. Prisma already runs the query.

## Flag

- **axiom 2** — the assertion is on a spy for an internal collaborator
  (`expect(helperSpy).toHaveBeenCalled()`) when the observable return value or
  persisted state is available to assert on instead.
- **axiom 2** — `toHaveBeenCalledTimes(n)` used as the outcome, where `n` is an
  implementation detail (how many times a cache was consulted, how many queries
  ran) rather than part of the promise.
- **axiom 2** — the test reaches past the public surface: imports a
  non-exported-by-intent path, asserts on a private field, or depends on
  property order, key insertion order, or an internal id format the contract
  does not fix.
- **axiom 2** — the test asserts an exact error message string where the
  contract is the error type or code.
- **axiom 3** — the assertion restates a type: `expect(typeof x).toBe("string")`
  on a `string`-typed value, `expect(result).toBeDefined()` on a non-optional
  return, `expect(Array.isArray(xs)).toBe(true)` on a typed array.
- **axiom 3** — the test exercises library behaviour rather than ours: that Zod
  rejects a bad payload with no schema logic of ours in the path, that Prisma
  persists a field, that a React hook re-renders, that `JSON.parse` throws.
- **axiom 3** — the test only proves a constant is still its value, or that a
  label reads what it reads, with no logic between the literal and the
  assertion.

## Do not flag

- A spy assertion where the call **is** the contract: an emitted queue job, an
  outbound HTTP request, a webhook delivery, a logged audit event, a ClickHouse
  write. Observing the effect is the only way to assert it.
- `toHaveBeenCalledWith` used to pin a payload we own — the queue payload shape
  in `packages/shared/src/server/queues.ts` is a contract, not a detail.
- `toHaveBeenCalledTimes` when the count is the promise: retried exactly twice,
  debounced to one call, idempotent so the second call is a no-op.
- A schema test that exercises **our** refinements, transforms, discriminators,
  or defaults. That is our logic living inside Zod.
- Exact error messages that are user-facing copy under test, or that an API
  contract pins.
- Tests of our own framework adapters and wrappers, even though a framework is
  named. The seam is ours.
- Rendering assertions that prove our conditional logic chose a branch, rather
  than that React renders.

## Verdict

- `rewrite` — the right assertion exists and is reachable; name it (assert the
  returned value, the persisted row, the thrown type).
- `delete` — nothing of ours is under test and no rewrite recovers one.
- `comment` — the coupling is real but the alternative assertion is not
  available at this layer.
