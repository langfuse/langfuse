# Building a transcript fixture from a trace JSON export

This guide is written so an agent can follow it end to end. Hand it a trace
export and this file, and it should return one fixture file plus a registry
edit, with the expectation left open.

## Input

A trace JSON export, downloaded from the trace page (`⋯` menu → Download
JSON). The file is named `trace-<traceId>.json` and has this shape:

```json
{
  "observations": [
    {
      "id": "…",
      "traceId": "…",
      "sessionId": "…",
      "parentObservationId": "…",
      "type": "GENERATION",
      "name": "…",
      "startTime": "2026-08-31T12:33:14.205Z",
      "endTime": "2026-08-31T12:33:14.818Z",
      "level": "DEFAULT",
      "statusMessage": "",
      "model": "gpt-5.4",
      "input": "{\"messages\":[…]}",
      "output": "{\"content\":null,\"tool_calls\":[…]}",
      "metadata": { "…": "…" },
      "…": "many more fields the fixture does not need"
    }
  ],
  "scores": []
}
```

For a session-scoped fixture, export every trace of the session separately
and concatenate their `observations` arrays. The session page download does
not include observations.

Along with the file, the requester may say which observations to drop, which
payloads to shorten, and what the case is meant to exercise. Without such
notes, keep everything.

## Output

One file `fixtures/trace/<kebab-case-name>.ts` (or `fixtures/session/…`)
exporting a single `<camelCaseName>Fixture` that `satisfies TranscriptFixture`,
plus a one-line registration in `fixtures/index.ts`. Use
`trace/support-copilot-refund-loop.ts` as the reference for tone and layout.

## Procedure

1. **Draw the tree.** Build the parent → child tree from `parentObservationId`
   and write it as the file's leading doc comment in this style:

   ```
   [SPAN] name                    id      root
     [AGENT] name                 id
       [GENERATION] name  model   id   in: <message roles>   out: <what came back>
       [TOOL] name                id   in: <relation to a call>  out: <summary>
   ```

   Annotate each `GENERATION` with the roles in its input and a short summary
   of its output. Annotate each `TOOL` with how its input relates to a
   tool call nearby. Note when the export order differs from tree order.

2. **Keep every observation.** Types the builder ignores (`SPAN`,
   `GUARDRAIL`, `EVENT`, …) stay in the fixture. Filtering is the builder's
   job and must be tested.

3. **Keep the export order.** Do not sort by time or by tree position. The
   builder must not rely on input order.

4. **Map fields.** Copy these and drop everything else:

   | Export field          | Fixture field         | Rule                                          |
   | --------------------- | --------------------- | --------------------------------------------- |
   | `id`                  | `id`                  | verbatim                                      |
   | `traceId`             | `traceId`             | verbatim; hoist into a const                  |
   | `sessionId`           | `sessionId`           | verbatim when present; hoist into a const     |
   | `parentObservationId` | `parentObservationId` | `""` becomes `null`                           |
   | `type`                | `type`                | verbatim                                      |
   | `name`                | `name`                | verbatim                                      |
   | `startTime`           | `startTime`           | verbatim ISO string                           |
   | `endTime`             | `endTime`             | verbatim ISO string or `null`                 |
   | `level`               | `level`               | only when not `DEFAULT`                       |
   | `statusMessage`       | `statusMessage`       | only when non-empty                           |
   | `model`               | `model`               | only when non-empty                           |
   | `input`               | `input`               | see encoding rules                            |
   | `output`              | `output`              | see encoding rules                            |
   | `metadata`            | `metadata`            | verbatim object; hoist and spread when shared |

5. **Encode I/O exactly as stored.** The export carries `input` and `output`
   as one JSON-encoded string each. In the fixture, write the decoded value as
   an object literal wrapped in `JSON.stringify(...)`. This keeps the stored
   encoding while making the content readable:

   ```ts
   input: JSON.stringify({
     messages: [{ role: "user", content: customerMessage }],
   }),
   ```

   Strings nested inside that value stay strings. Tool-call `arguments` and
   tool-message `content` are often JSON text themselves. Write them as
   `JSON.stringify(...)` inline, never as decoded objects:

   ```ts
   function: {
     name: "stripe_find_charges",
     arguments: JSON.stringify(findChargesArguments),
   },
   ```

   If a stored value is plain text rather than JSON, keep it as a string
   literal. If it is `null`, keep `null`.

6. **Hoist repeated values.** System prompts, user messages, tool-call ids,
   tool arguments, and the final answer usually appear in several
   observations. Give each a `const` and reuse it, so byte-equality across
   observations is visible in code. When a `TOOL` observation's input equals
   a tool call's arguments, use the same const for both.

7. **Shorten with care.** Long payloads (retrieved documents, big system
   prompts, base64) may be replaced by a short bracketed placeholder such as
   `"[reduced: 78 KB of retrieved docs]"`, with these constraints:
   - Transcript deduplication relies on message equality. A value that appears
     in more than one observation must be shortened identically everywhere,
     or not at all.
   - Substring relations matter too. If one message quotes another (a user
     turn that says "Rate this joke: <joke>"), shorten the quoted text and the
     quoting text consistently, or leave both intact.
   - Never change roles, part types, ids, ordering, or the number of
     messages.

8. **Redact consistently.** Replace personal data (emails, real names, keys)
   with stable stand-ins, applied to every occurrence. Seeded demo data needs
   no redaction.

9. **Leave the expectation open.** `expected: undefined`, always. The
   requester defines the expected transcript by hand.

10. **Write the description.** Two to five sentences on what makes this tree
    interesting for transcript semantics: history replay or its absence,
    where tool results live, disjoint generations, repeated system prompts,
    non-message I/O, unusual nesting, export order quirks.

11. **Register and verify.** Add the export to `traceTranscriptFixtures` or
    `sessionTranscriptFixtures` in `fixtures/index.ts`, then run:

    ```bash
    pnpm --filter @langfuse/shared run test src/utils/transcript/fixtures/fixtures.test.ts
    ```

    ```bash
    pnpm --filter @langfuse/shared run typecheck
    ```

## Template

```ts
import type { TranscriptObservation } from "../../types";
import type { TranscriptFixture } from "../fixture-types";

/**
 * <One line: what the application does in this trace. Where it came from.>
 *
 * <Tree, as described in step 1.>
 */

const traceId = "…";
const sessionId = "…";

// Hoisted repeated values (step 6).

const metadata = {
  /* … */
};

const common = { traceId, sessionId, metadata };

const observations: TranscriptObservation[] = [
  {
    ...common,
    id: "…",
    parentObservationId: null,
    type: "SPAN",
    name: "…",
    startTime: "…",
    endTime: "…",
    input: JSON.stringify({
      /* … */
    }),
    output: JSON.stringify({
      /* … */
    }),
  },
  // …
];

export const <camelCaseName>Fixture = {
  name: "<tree shape in a few words>",
  scope: "trace",
  description: "<step 10>",
  observations,
  expected: undefined,
} satisfies TranscriptFixture;
```

## Checklist before handing back

- [ ] Tree comment present and consistent with `parentObservationId`.
- [ ] Every observation from the export is present, in export order.
- [ ] `""` parent ids became `null`.
- [ ] Every `input` / `output` that was a JSON string is `JSON.stringify(...)`
      of a literal; nested JSON strings are still strings.
- [ ] Repeated values are hoisted; shortened values are shortened everywhere.
- [ ] `level`, `statusMessage`, `model` only where the rules say.
- [ ] `expected: undefined`.
- [ ] Registered in `fixtures/index.ts`; integrity test and typecheck pass.
