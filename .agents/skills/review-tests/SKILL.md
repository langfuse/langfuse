---
name: review-tests
description: |
  Review changed Vitest tests for redundancy against six axioms — one failing
  reason per test, contract not implementation, equivalence classes over
  enumerations, a test that can actually fail — then print or post the
  findings. Use when the user wants a test review, asks whether tests are
  redundant or pull their weight, or says "review tests", "are these tests
  worth it", "too many tests".

  Example Usage

  `/review-tests` reviews the branch diff and prints findings to chat.

  `/review-tests worker/src/queues` sweeps whole files instead of the diff.

  `/review-tests --post` posts the review to the branch's open PR.

  `/review-tests --rules uniqueness,ownership` runs only those judges.
metadata:
  short-description: Review changed tests for redundancy against the axioms
---

# Test review workflow

Every test costs a name, a fixture, and a line in every future reader's head.
This skill asks one question of each changed test:

> If I delete this test, what production bug becomes possible that the rest of
> the suite would not catch?

A test with no answer is redundant.

**Precondition: the suite is assumed green when a review is triggered.**
Findings are static judgment over source, not a live run — nothing in this
pipeline executes a test. A red suite can produce false flags, because a
judge reading a failing assertion cannot tell "already broken" from "would
break if this test were gone."

## The axioms

Every finding rests on one of these six by number. This list is canonical;
the rule files quote it and add repository-specific guidance, they do not
restate it.

1. **One failing reason per test.** If two tests can only fail together, one of
   them is redundant. Ask: what bug would this catch that no other test
   catches? Setup complexity is part of this axiom, not a separate one: if a
   test needs more fixture than the code it tests, and a candidate already
   covers the same behavior, that imbalance is evidence toward deleting it.
2. **Test the contract, not the implementation.** A test that asserts on
   internal calls, private state, or ordering that the public API doesn't
   promise will break on refactors without catching bugs. Delete or rewrite
   against observable behavior.
3. **Don't test the type system or the framework.** Asserting that a
   constructor sets a field, that a getter returns what the setter stored, or
   that an ORM saves a row is testing someone else's code.
4. **Equivalence classes over enumerations.** Inputs that take the same code
   path are one test. Keep one representative per class plus each boundary;
   drop the rest.
5. **A test must be able to fail.** Mocks that return exactly what the
   assertion checks, tautological asserts, tests that pass with the
   implementation deleted — these are noise.
6. _(dropped — was "prefer the lowest layer"; layer is not judged in this
   version)_
7. **No test for a bug that can't recur.** Regression tests for behaviors now
   enforced by types, schemas, or removed code paths can go.

The numbering keeps the gaps (no 6, no 8) deliberately, so a cross-reference to
axiom 1 or 7 stays stable across skill revisions.

**Axioms are internal.** They drive the judges' and the reviewer's reasoning.
They must never appear in an emitted review comment — no "axiom 1", no axiom
number, nothing that assumes the reader has read this list. A comment stands
on its own evidence: the covering test, the input class, the assertion.

The two rule files group the six by the question a judge asks:
`rules/uniqueness.md` (1, 4, 5, 7) — would deleting this let a bug through
nothing else catches? `rules/ownership.md` (2, 3) — is the assertion on our
contract, or on framework, types, or internals?

## Pipeline

No stage runs a test. `ensure-services.mjs` still exists, but nothing in this
version needs the stack, so it is optional, not a precondition.

```
ensure-services (optional)
  -> gather      static clusters: for each production symbol a changed test
                 calls, every test block (anywhere in the suite) that
                 statically references it — no model, no execution
  -> judges      2 read-only flaggers, one per rule file (uniqueness,
                 ownership), each reading a cluster's tests and axioms and
                 emitting candidate flags with a suggested verdict
  -> chunker     unions clusters that share a member test into one review
                 chunk, so a test flagged from two different symbols is
                 reviewed once, with all its candidates together
  -> reviewer    per chunk: the tests' full source, the judges' candidate
                 flags, and the axioms combine into final comments
  -> report      printed locally, or posted to the PR with --post
```

`gather.mjs` is deterministic: the same diff always produces the same
clusters. The judges and the reviewer are the only stages that cost tokens;
there is no confirm, defend, or gate stage in this version — those belonged to
an earlier design that ran tests to confirm coverage claims. Judge from source
alone.

## Verdicts

Every test in scope ends at exactly one of:

- **`delete`** — a covering test already exists; removing this one loses no
  coverage.
- **`edit`** — the test has a real, unique reason to exist, but it is buried in
  a redundant case list, an unfailable assertion, or an ownership violation.
  The comment carries the fix as a suggestion.
- **`keep`** — silent. Counted in the summary, never given a comment. Most
  tests in any diff end here.

There is no third comment-worthy-but-no-change bucket and no separate
"suggestion only" tier. If a judge's flag cannot be turned into a concrete
`delete` or `edit` with real evidence, it does not survive to become a
comment — the test is kept.

## Flags

- **`--post`** — post the review to the current branch's open PR instead of
  printing it to chat. A local run never posts on its own.
- Path arguments — sweep whole files instead of the branch diff.
- **`--rules uniqueness,ownership`** — restrict which judge(s) run. Naming both
  is the same as the default.
- **`--model judge=… reviewer=…`** — override a stage's model.

**There is no `--fix` flag and no fix mode.** A local run prints the review;
that is the whole of what this skill does by itself. Acting on a finding —
deleting a test, applying a suggested edit — is the human or agent reading the
review and making an ordinary edit, the same way they would act on any other
piece of feedback. Do not document, offer, or build a mode that applies
findings automatically; there is nothing in this skill's contract for it to
read back.

## Report

### Locally (default)

Findings grouped by file, one line each — line, name, then the verdict's
evidence, in plain language, with no axiom numbers:

```
worker/src/queues/__tests__/exportQueue.test.ts
  :446  delete  "added redundant test"
        exportQueue.test.ts:302 already asserts the same rejection from the
        same fixture; dropping this one loses no coverage.
  :120  edit    "maps usage units from usage_details"
        asserts a mapped value through a full database round-trip with no
        query logic in between; call mapUsage directly and drop the fixture.
```

Then, when present: **Not reviewed** (files the evidence could not scan), and
**Not covered** (something a human flagged that no judge reported — never
turned into an edit, only noted). End with `<N> reviewed, <M> kept`. Say
`no findings` when clean.

### On a PR (`--post`)

One review, not a stream of comments. This is the contract the reviewer stage
implements; the pipeline produces it, this skill exists to describe it.

- **Summary comment** — a one-line verdict count (`<N> reviewed, <M> edited,
<K> deleted, <J> kept`), and nothing else framework-shaped. No axiom list,
  collapsed or otherwise — a reader never needs to learn this skill's internal
  vocabulary to act on a comment.
- **Inline comment per finding**, anchored to `file:line`. A `keep` posts
  nothing.
- **Delete comment** — bold first line `**Remove this test.**`, a blank line,
  then one line of evidence: the covering test and why dropping this one loses
  no coverage. When the deleted test's one unique check has to move into the
  survivor instead of simply disappearing, use
  `**Fold this test into [survivor.test.ts:NN](url).**` instead, and link the
  paired edit comment on the survivor.
- **Edit comment** — the suggestion block (a fenced `suggestion` block)
  **first**, holding the whole replacement, then the explanation below it,
  linking any deleted tests the edit consolidates.
- Every comment is plain, human-readable, and evidence-led: name the covering
  test, the input class, the assertion. No axiom references. No em dashes or
  en dashes — write around them.
- Every comment ends with the attribution footer.

Do not post `@claude review` from this skill.

## Candidates

Axiom 1 asks whether another test exercises the same production _function_.
`gather.mjs` answers the "which tests might" half of that statically, by
shared function calls, without any coverage tooling: two tests that both call
`getGenerationsForAnalyticsIntegrations(` are candidates for each other, and a
fixture helper every test calls (`createOrgProjectAndApiKey`) is weighted down
so it does not manufacture false candidates. The judge answers the "does it
actually" half by reading both sources — there is no measurement step behind
it in this version to fall back on, so a flag with a `covered_by` the judge
cannot support from the source it was given is not a finding.

What this cannot see: a duplicate that never names the function — an API-route
test reaching the service over HTTP while a unit test calls it directly.
Static candidates will not link them. That gap is accepted rather than paid
for with a whole-suite coverage map.

## Measurement (parked)

`scripts/lib/measure.mjs` stubs one production export to throw and runs the
tests that reference it, to see which actually fail — the mechanical version
of axiom 5's "just stub the function body." It is real, tested code, but it is
**not on the v1 path**: no stage above calls it, and no finding in this
version's report is measurement-confirmed. It exists for a future revision
that wants to trade the token cost of running tests for stronger evidence on
individual flags; until then, `ensure-services.mjs` and `measure.mjs` are
dormant, not required setup.

## Triggering from GitHub

Not wired up. Running this from an Action needs a thin `issue_comment` workflow
matching `/review-tests`, a pinned Claude Code version, and confirmation that
the Workflow tool is enabled in that version. Do not enable a `pull_request`
auto-trigger until the verdicts have been checked against a known-answer set
of PRs.

## Verifying this skill

The deterministic layer has tests; run them after changing it.

```sh
node --test .agents/skills/review-tests/scripts/lib/scan-tests.test.mjs
node --test .agents/skills/review-tests/scripts/lib/candidates.test.mjs
node --test .agents/skills/review-tests/scripts/lib/clusters.test.mjs
node --test .agents/skills/review-tests/scripts/lib/measure.test.mjs
node .agents/skills/review-tests/workflows/workflow-logic.test.mjs
```

The `scripts/lib/*.test.mjs` files cover the scanner, the candidate ranking,
and the cluster builder that scopes them; `measure.test.mjs` covers the parked
stub-and-run path on its own, with no live test run of its own required.
`workflow-logic.test.mjs` runs the judge/chunker/reviewer pipeline with mocked
agents. New `scripts/lib/*.test.mjs` files added alongside future pipeline
work run the same way — `node --test` on the file.
