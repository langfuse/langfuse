# query-ast decision records

This file lists the standing design rules of the query-AST compiler: its passes, its node kinds and its type guards. Each record states one rule the code enforces today and names the code and the test that fail if someone breaks it. For how the compiler works, read the [README](./README.md); these records say why a rule exists and what it costs.

To add a record, append it at the end with the next number. Do not renumber or delete records: when a rule changes, add a new record and mark the old one "Superseded by DR-00M" under its title. Feature choices for one call site do not belong here.

## DR-001 · Raw SQL compiles only as a column reference or an ORDER BY direction

Decided: 2026-11-20 · PRs: #18868, #20198

**Context:** A lexer kept free raw SQL text confined. Review after review found a new way past it: a backslash in a string, `{p:Identifier}` braces, a zero-width space after `IN`, text composed across two raw nodes, a value spliced inside raw quotes. Each bypass could read a relation the tenancy pass never saw.

**Decision:** Raw SQL compiles in two shapes only: `sql.ref("t.col")` and the `asc` / `desc` direction `orderBy` builds. Everything else (`` sql`…` ``, `sql.raw`, `sql.lit`, `sql.id`, `sql.table`, `sql.join`, `modifyFront` / `modifyEnd`) throws. The lexer is deleted. No rule may keep free text safe by re-lexing ClickHouse syntax.

**Consequences:** A missing construct needs a builder expression, a helper in `extensions.ts`, an allowlisted `eb.fn`, or a new node kind (DR-010).

**Enforced in:** `compiler.ts:ClickHouseQueryCompiler.visitRaw`; `raw.test.ts` ("raw SQL").

## DR-002 · Every compiled query runs every pass, and each pass is tested alone

Decided: 2026-11-08 · PRs: #19806, #19793, #20096, #20202

**Context:** The WHERE-only condition compiler first ran two passes, so its conditions carried no tenancy. Later, an empty predicate was proposed as a reason to skip compiling. When the soft-delete pass was deleted, tenancy lost a rejection it had silently relied on: right and full joins on events.

**Decision:** One list, `compilerPasses`, runs in full on both entry points, empty predicates included. The compiler refuses a tree the tenancy pass did not stamp. A deleted pass hands its rejections to another pass first. Each pass's guarantee is tested with only that pass applied, so another pass cannot mask a gap.

**Consequences:** A new pass goes into `compilerPasses`, the hand-written list in the production test, and a suite of its own ([Testing a pass](./README.md#testing-a-pass)). The render helpers run no pass, so they reject any subquery.

**Enforced in:** `compile.ts:compilerPasses`, `tenancy.ts:assertTenancyStamped`, `tenancy.ts:assertRelationFree`; `extensions.test.ts` ("compiler passes in production"), `nodes.test.ts` ("refuses to compile the WHERE of a select the tenancy pass did not stamp").

## DR-003 · Only inner, left, right and full joins compile, and FROM/JOIN names are unique

Decided: 2026-11-13 · PRs: #20096

**Context:** Tenancy injected `CROSS JOIN … ON`, which ClickHouse cannot parse. Lateral and apply joins and a comma FROM (`from a, b`, a cross join in ClickHouse) still compiled. `FROM traces JOIN scores AS traces` let one `traces.project_id` predicate count as the scope of both relations.

**Decision:** Every join type outside an allow-list throws, tenanted or not. A select with more than one FROM item throws. Two FROM/JOIN items of one select may not share a name (alias, else table name).

**Consequences:** Write an inner join with an explicit ON condition. Give each relation its own alias.

**Enforced in:** `tenancy.ts:ALLOWED_JOINS`, `tenancy.ts:assertJoinTypeAllowed`, `tenancy.ts:assertSingleFrom`, `ctes.ts:assertReadsResolve`; `nodes.test.ts` ("rejects every join type but inner, left, right and full, tenanted or not", "rejects a select with more than one FROM item", "rejects a select whose FROM and JOIN items share a name"), `tenancy.golden.test.ts` ("tenancy pass alone: join shapes").

## DR-004 · A name that could mean two relations is rejected, not resolved

Decided: 2026-10-20 · PRs: #18865, #19040, #20194

**Context:** CTEs named like registry tables forced every pass to work out which of the two a name meant. Review rounds kept finding tenancy leaks in that logic.

**Decision:** A CTE may not take a registry table's name or reuse a sibling's or an enclosing CTE's name. Every FROM/JOIN name is an unqualified registry table or a CTE declared before it. Names ClickHouse could read before a relation (an alias or lambda parameter named like a relation) are rejected too. Later passes then read every registry name as its table.

**Consequences:** Rename or reorder the CTEs; add a physical table to the registry to read it. Recursive CTEs are out. See [Using it](./README.md#using-it).

**Enforced in:** `ctes.ts:CteNamePlugin`, `shadowing.ts:NameShadowingPlugin`; `nodes.test.ts` ("CTE names", "names that shadow a relation").

## DR-005 · A per-table decision resolves each column to its FROM/JOIN item, or throws

Decided: 2026-10-19 · PRs: #18865, #18868

**Context:** The first routing design sent the whole query to `events_full` when any name looked like a truncated column or raw text matched a regex. Five rounds each found a spelling it missed, and over-routing was waved through as "performance only". Keying routing on shared Kysely nodes also routed two CTEs built from one base builder the same way.

**Decision:** Routing, scoping and bind typing resolve each reference as ClickHouse does: qualifier to its relation, bare column to its select's single relation. A reference the pass cannot resolve throws: on `events`, `*`, `e.*` and an unqualified truncated column; on `events_truncated`, the same reads once its WHERE routes it to `events_full`, and an unqualified truncated column in that WHERE. `*` over other registry tables, and over `events_truncated` while it stays on `events_core`, compiles ([Using it](./README.md#using-it) has the full rules). No decision matches on names or text, widens to the whole query, or falls back to the costly table. Passes copy the tree before keying on nodes.

**Consequences:** Qualify columns. Over-routing to `events_full` is a bug.

**Enforced in:** `eventsRouting.ts:EventsTableRoutingPlugin`; `eventsRouting.test.ts` (`"rejects select * and select e.*, but not count(*)"`, `"routes each use of a shared builder by its own reads"`).

## DR-006 · Only the routing pass picks `events_core` or `events_full`

Decided: 2026-11-08 · PRs: #18868, #19806

**Context:** The condition compiler computed the table through routing and then dropped it, while a predicate module kept its own rule. Two rules for one choice drift.

**Decision:** Code reads the logical `events` or `events_truncated` relation. Naming a physical events table anywhere is a compile error. An entry point that runs routing hands its verdict to the caller (`requiresEventsFull`); no caller decides again.

**Consequences:** A new routing exemption extends the routing pass, not a call site. See [Using it](./README.md#using-it) for the current rules.

**Enforced in:** `eventsRouting.ts:rejectPhysicalName`, `compile.ts:compileClickhouseCondition`; `eventsRouting.test.ts` ("rejects a physical events table named as %s"), `extensions.test.ts` ("reports the routing verdict for %s").

## DR-007 · Every name the compiler writes verbatim is a plain identifier, on every query

Decided: 2026-11-16 · PRs: #18868, #20194

**Context:** Function names were checked only while `events` was in scope. Rounds then found names carrying SQL: `eb.fn.agg("columns", …)`, a padded `"columns "`, `collate`. A function can also read a table or server state.

**Decision:** The compiler checks every function, aggregate, CTE and identifier name against `[A-Za-z_][A-Za-z0-9_]*` in its visitor, whatever the query reads. Function calls must be on an allowlist. `collate` is rejected outright.

**Consequences:** A new ClickHouse function needs an allowlist entry ([Escape hatches](./README.md#escape-hatches-and-their-cost)).

**Enforced in:** `compiler.ts:assertPlainName`, `compiler.ts:ClickHouseQueryCompiler.visitCollate`, `functions.ts:FunctionAllowlistPlugin`; `nodes.test.ts` ("names the compiler writes verbatim"), `functions.test.ts` ("function allowlist").

## DR-008 · Caller values bind with the column's type; only code constants inline

Decided: 2026-10-16 · PRs: #18829, #18865, #18867

**Context:** Kysely doubles `'` in an inlined string but leaves `\`, which ClickHouse reads as an escape, so `\' OR 1=1 --` could run as SQL. A proposed fallback typed a bind by column name alone, from whichever table had that name.

**Decision:** Values from a caller are bound, typed from the compared column's registry entry. A value compared to a registry column the compiler cannot place throws: a qualifier no relation declares, a table outside the registry (or a CTE that reads one), or an unqualified column a non-registry relation may provide. A value compared to a computed expression, a computed alias, an ARRAY JOIN alias or a column no relation has binds by its JavaScript value (`binds.test.ts`, "binds a computed CTE column by value"). Code constants inline through `literal(...)`, which rejects backslashes. An IN list may not mix both.

**Consequences:** Never pass user input to `literal`. Qualify columns or add the table to the registry so binds can be typed.

**Enforced in:** `compiler.ts:ClickHouseQueryCompiler.sanitizeStringLiteral`, `compiler.ts:resolveBindType`, `compiler.ts:assertNotMixedValueList`; `extensions.test.ts` ("rejects a backslash, which ClickHouse reads as an escape"), `binds.test.ts` ("rejects a value bound against %s", "rejects an IN list mixing literals and bound values").

## DR-009 · A pass recognises helper output by a node marker, and the helper guards what the marker vouches for

Decided: 2026-10-20 · PRs: #18868, #19038

**Context:** Routing recognised a metadata lookup by its shape, so any matching hand-built node passed as one. Once `metadataValue` took its columns as arguments, routing still skipped the marked subtree, and a lookup reading `e.input` stayed on `events_core`.

**Decision:** `metadataValue` and `firstMetadataValue` set `ArrayIndexNode.metadataLookup`, and routing trusts only that marker. Because routing does not walk the marked arguments, the helper accepts only one relation's `metadata_names` / `metadata_values` refs.

**Consequences:** Widening a marked helper's parameters needs a helper guard or a pass that walks them, plus a test with a truncated column per new parameter.

**Enforced in:** `nodes.ts:ArrayIndexNode`, `extensions.ts:assertMetadataColumns`; `extensions.test.ts` ("rejects a lookup over anything but one relation's metadata columns").

## DR-010 · A new node kind joins `CustomNode` and adds one `CUSTOM_NODE_OPS` entry

Decided: 2026-11-10 · PRs: #19908

**Context:** Each ClickHouse-only node kind was built with its own `as unknown as OperationNode` cast and special-cased in the transformer and the compiler separately. A kind missing from one of them was dropped silently.

**Decision:** Node kinds in an ordinary node slot form the `CustomNode` union. One table holds each kind's `transform` and `compile`; both dispatch through it. Builders wrap a node with `asOperationNode`, the only cast.

**Consequences:** A kind without an entry is a `tsc` error. See [How ClickHouse clauses land](./README.md#how-clickhouse-clauses-land-no-fork).

**Enforced in:** `nodes.ts:CUSTOM_NODE_OPS`, `nodes.ts:asOperationNode`; the mapped type on `CUSTOM_NODE_OPS` (checked by `pnpm --filter @langfuse/shared run typecheck`).
