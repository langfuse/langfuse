# Before Adding a New Concept

- [Precedence](#precedence) — these rules yield to an explicit instruction
- [`concept-reformulate-before-extending`](#concept-reformulate-before-extending)
- [`concept-no-exemption-options`](#concept-no-exemption-options)

A new concept is anything that adds vocabulary to shared backend code and that
other people must then learn and maintain:

- a field on a shared schema (Zod contract, declaration schema, queue payload,
  domain type)
- an option or flag on a shared function, service, or repository signature
- a member on a shared enum, status, or state machine
- a branch in shared code that exists for one caller
- an env toggle that changes behavior of code other features depend on
- a new wrapper, layer, or error type placed beside an existing one

Adding one is cheap and looks local: a couple of type-safe lines, tests pass.
Owning one is permanent and global. Every future reader of that abstraction must
learn it, and every future change to it must reason about the interaction between
the new concept and each existing one. In `packages/shared` the multiplier is
worst: `web`, `worker`, and `ee` all consume it, so a concept added for one call
site becomes part of three runtimes' surface.

Among designs whose correctness you can demonstrate, prefer in order:

1. a change confined to your own declaration or call site;
2. a new parameter every caller may set, with one meaning on every path — the
   cheapest form of new vocabulary;
3. a change to shared behavior for all existing callers;
4. any other new concept: one only some callers can use, or that others must
   learn before they can read the abstraction correctly.

Correctness outranks every rung — a tidier declaration that returns wrong
numbers is the expensive option, not the cheap one. Otherwise justification
scales with the rung; 3 and 4 are adjacent in cost, and a design that leans on
an existing declaration inherits its defects.

These two rules are the brake. They are not a prohibition — new concepts are
sometimes correct — they are the check you run first. Both are citable by name,
like the `clickhouse-best-practices` rules: "Per `concept-reformulate-before-extending`…".

## Precedence

**These rules are defaults for when the shape of the solution is yours to
choose.** They do not override an explicit instruction. When someone asks for a
particular shape — a named field, a specific mechanism, "make the builder
support this" — say once, briefly, what the cheaper formulation would be and
what the requested one costs, then build what was asked. If they reaffirm, that
is the decision: implement it well and record the tradeoff in the PR, so the
next reader can see the cost was chosen rather than missed.

A requirement that merely *arrives* phrased in mechanism terms is not an
explicit instruction. Inherited framing — a ticket, a handoff, or an earlier
draft that already describes the answer as "a flag that…" or "a field meaning…"
— is exactly what these rules ask you to re-examine. The precedence above is for
a person choosing a shape on purpose, not for a description that happens to name
one.

---

## `concept-reformulate-before-extending`

**Impact: HIGH** — a new concept multiplies the abstraction's behavior matrix
permanently; a reformulated caller costs nothing.

When a requirement does not fit the vocabulary that already exists, the first
hypothesis is that **the requirement was framed in terms of the first
implementation you reached for**, not that the vocabulary is incomplete. Restate
what the caller needs in the existing vocabulary before concluding a concept is
missing.

Tells that you may be extending prematurely. Each is a signal to check, not a
verdict — weigh them together:

- The name describes a mechanism rather than a domain fact — `preAggregated`,
  `skipNormalization`, `useLegacyPath`, `isSpecialCase`. Naming a mechanism is
  not disqualifying on its own: `explodeArray`, `pairExpand`, and `useFinal` name
  mechanisms the caller genuinely chooses between, and they belong in the
  vocabulary. The distinction is whether the name describes a choice the caller
  is making or the internals of the code that reads it.
- You cannot explain what it means without describing those internals. This is
  the sharper form of the tell above, and it holds on its own.
- Exactly one caller or declaration uses it, and no plausible second one exists.

**Incorrect — a new schema field describing the author's SQL:**

```ts
// "count the expanded rows in my group" is an aggregate at the inner level, so
// neither compilation shape accepts it as written. A new declaration field
// forces one shape and exempts the measure from the other's handling.
toolCallInvocations: {
  sql: "count(*)",
  preAggregated: true, // new field on viewDeclaration, read on one code path
  requiresDimension: "calledToolNames",
}
```

**Correct — the same number, restated so an existing primitive carries it:**

```ts
// "how many times does this tool name occur in the row's array" is a row-level
// expression. The pre-existing @@AGGN@@ template supplies the aggregate the
// inner GROUP BY needs, and the compiler strips it for the other shape.
toolCallInvocations: {
  sql: "countEqual(@@AGG1@@(observations.tool_call_names), calledToolNames)",
  aggs: { agg1: "any" },
  requiresDimension: "calledToolNames",
}
```

Both return per-tool invocation counts. The first needs a schema field plus two
compiler branches; the second needs no change to the shared code at all.

The same move applies outside query code: a queue payload gaining a field the
consumer can already derive from the entity it loads; a service option that
restates a condition the caller could evaluate before calling; a status member
that names a combination of statuses that already exist.

**Procedure.** Before adding the concept, name the existing concepts you
considered and state for each why it cannot express the requirement — in the
plan, then in the PR description. If you cannot write that paragraph, you have
not finished reformulating. If you can, it is the justification a reviewer needs
and the concept is probably right. Concluding the opposite — that an existing
concept already expresses it, so nothing needs adding — is a claim about the
caller's reach, not yours: name the path the requester will actually use, the UI
control or API field and the default they land on. A capability reachable only
by hand-written JSON is missing, not present.

**When one of them comes close but does not work, call that out explicitly** —
name the option and the exact case where it breaks, instead of moving straight
on to a new concept. A near miss is often a defect in that option rather than a
gap in the vocabulary: a grain, nullability, or unit its declaration never
pinned down, which callers have been quietly compensating for. Fixing the
definition can remove the need for both the new concept and the compensation.
If it would change existing callers' results, surface that as its own decision
rather than working around it.

---

## `concept-no-exemption-options`

**Impact: HIGH** — an exemption is untestable in combination and silently scopes
to whichever code path happens to read it.

A concept whose job is to exempt one caller from an invariant is the wrong fix.
The invariant exists because the shared code relies on it; carving one case out
makes it conditional, and every later change must reason about both worlds.

Tells, in order of severity:

1. Its meaning is "do not apply your normal handling to me".
2. It is honored on only one of several code paths, or only when another
   argument has a particular value — so the correct value of one option depends
   on another. That is a hidden contract, and callers who do not care still see
   it in the signature.
3. The follow-up fix adds a *second* rule — a validation error, an allow-list, a
   UI restriction — to contain a hole the first one opened, instead of removing
   the first one.

Tell 3 is decisive. When a fix adds rules rather than removing one, the concept
is wrong, not incomplete.

**Incorrect — a boolean only meaningful for one variant of another option:**

```ts
getObservationsFromEventsTableInternal({
  select: "count" | "rows" | "trace-delete-cursor",
  includeUniqueTraceCount?: boolean, // Only honored with select: "count"
});
```

**Correct — extend the axis that already exists:**

```ts
getObservationsFromEventsTableInternal({
  select: "count" | "count-with-unique-traces" | "rows" | "trace-delete-cursor",
});
```

The same shape appears as a branch that skips shared handling for one
declaration:

```ts
// Incorrect: an escape hatch from the wrap every other declaration receives.
if (metric.requiresDimension && !metric.preAggregated && !sql.includes("(")) {
  sql = `any(${sql})`;
}
```

**Correct:** satisfy the invariant from the caller's side, using the
parameterised primitive the other callers use. If no such primitive exists, add
the *parameter* rather than the exemption — one meaning, available to every
caller, honored on every path.

**Not every alternative to an exemption is cheaper.** Avoiding one by narrowing
shared behavior for every existing caller — removing a choice, tightening a
default, forcing one path — is not automatically the smaller change: it changes
results for callers who never asked. If your change alters what existing callers
get, say which ones and how, and treat it as a decision separate from your
feature.
