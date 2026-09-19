# uniqueness — axioms 1, 4, 5, 7

Does this test earn its place? The collapsing question:

> If I delete this test, what production bug becomes possible that the rest of
> the suite would not catch?

If you cannot name that bug in one concrete sentence, the test is redundant.

## Axioms

Quoted verbatim from the canonical list in `SKILL.md`; the line under each is
this repository's gloss.

**Axiom 1.** One failing reason per test. If two tests can only fail together,
one of them is redundant. Ask: what bug would this catch that no other test
catches?

> The second test costs a name, a fixture, and a line in every future reader's
> head, and buys nothing.

**Axiom 4.** Equivalence classes over enumerations. Inputs that take the same
code path are one test. Keep one representative per class plus each boundary;
drop the rest.

> Five currencies through the same code path are one class; `0`, `-1`, and
> `MAX_SAFE_INTEGER` are boundaries and each earn a case.

**Axiom 5.** A test must be able to fail. Mocks that return exactly what the
assertion checks, tautological asserts, tests that pass with the implementation
deleted — these are noise. Mutation testing (or just stubbing the function
body) exposes them quickly.

> The rewrite gate is this axiom made mechanical: a replacement ships only after
> it has been seen failing with the function under test stubbed out.

**Axiom 7.** No test for a bug that can't recur. Regression tests for behaviors
now enforced by types, schemas, or removed code paths can go.

> When TypeScript, a Zod schema, a database constraint, or the deletion of the
> code makes the old bug unrepresentable, the regression test is a monument, not
> a guard. Name the construct that now prevents it.

## Flag

- **axiom 1** — a candidate test drives the same production path with the same
  input class and asserts the same outcome. Different wording, same failure.
- **axiom 1** — the test asserts a superset or subset of a candidate's
  assertions with no new input. The weaker one goes.
- **axiom 4** — a parameterized case list whose rows differ only in a value that
  the code under test never branches on. Keep one row per branch plus the
  boundaries; say which rows collapse.
- **axiom 5** — a tautological assertion: `expect(true).toBe(true)`,
  `expect(x).toBe(x)`, `expect(typeof x).toBe("object")` on a typed value, an
  assertion on a literal the test itself just wrote with no call in between.
- **axiom 5** — the asserted value comes back from a mock configured in the same
  test to return exactly it, with no production code in between. The test pins
  the mock, not the system.
- **axiom 5** — no assertion at all, and the body is not exercising a throw
  (`await expect(...).rejects`) or a type-level check.
- **axiom 7** — the test's stated bug is now unrepresentable: a required field a
  schema enforces, a variant the union forbids, a branch whose code the diff
  deleted. Name the construct that now prevents it.

## Do not flag

- Two tests over the same function whose inputs fall in different equivalence
  classes, even if the assertion text matches.
- Boundary cases that look like near-duplicates of the happy path. `0`, `1`,
  empty, null, max, and off-by-one are distinct reasons to fail.
- A test whose candidates are all `basis: "sibling"` and which asserts a
  different outcome than every one of them.
- Setup-heavy integration tests that share a fixture with a unit test but assert
  wiring rather than logic. That is `placement`'s call, not yours.
- Snapshot tests, unless the snapshot is of a value the test literally wrote.
- A test in a file the evidence lists under `unscannable`.
- **When `candidates` is empty, do not raise an axiom 1 flag at all.** There is
  no evidence of a covering test. Axioms 4, 5, and 7 still apply — they are
  properties of the test alone.

## Evidence required

An axiom 1 flag must carry `covered_by` naming each covering test id, and one
line per entry saying what it covers. A flag whose `covered_by` you cannot fill
from the candidates given is not a finding — return `pass`.

Candidates were chosen because they call the same production functions as the
test under review; each one lists the shared functions. Prefer candidates that
share the function the test is actually *about* over ones sharing only fixture
helpers. Your flag will be confirmed after you return: the shared function is
stubbed and both tests are run, and the claim stands only if both fail. So
judge from the sources — same input class, same asserted outcome — and leave
the proof to the confirmer. Do not lower confidence for lack of coverage data;
the confirmation supplies it.

## Verdict

- `delete` — the covering test already fails for this bug.
- `rewrite` — the test has a real unique reason buried in a redundant or
  unfailable shape (collapse the case list, assert the real outcome).
- `comment` — worth a reader's attention, not worth a change.
