// Locks the repo-versioned managed-prompt seed
// (`search-bar/server/prompts/search-bar-filter.prompt.json`) to the
// code-built fallback prompt (`buildFilterSystemPrompt`).
//
// The seed is meant to reproduce the code prompt byte-for-byte on day one —
// drift is only ever intentional going forward, once a human edits the
// managed prompt in the Langfuse UI. This test fails loudly if the seed's
// prose, a score-column literal, or a `{{variable}}` placeholder is changed
// in a way that would silently desync the two, so that kind of drift is
// caught in review rather than discovered by a customer.
//
// Compiles the seed with the REAL SDK class (`ChatPromptClient`) rather than
// a hand-rolled template substitution, so the mechanism under test is the
// one the app actually runs at request time — this is exactly the class
// `getPrompt(..., { type: "chat" })` returns. Imported from `langfuse-core`
// directly (declared as a devDependency here) rather than re-exported from
// `langfuse`: the pinned `langfuse@3.38.4` build's `.d.ts` claims to
// re-export it, but its compiled JS does not, so `new ChatPromptClient(...)`
// throws "not a constructor" if imported from `langfuse` at this pinned
// version. `resolveFilterPrompt.ts` only ever imports the `ChatPromptClient`
// TYPE from `langfuse` (erased at compile time), so production code is
// unaffected by this gap.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ChatPromptClient, type ChatMessage } from "langfuse-core";
import {
  buildFieldCatalog,
  buildFilterSystemPrompt,
  nullableFieldIds,
} from "@/src/features/search-bar/server/buildFilterPrompt";
import { SEARCH_BAR_FILTER_PROMPT_NAME } from "@/src/features/search-bar/server/resolveFilterPrompt";

const SEED_PATH = join(
  process.cwd(),
  "src/features/search-bar/server/prompts/search-bar-filter.prompt.json",
);

function loadSeed(): {
  name: string;
  type: string;
  prompt: ChatMessage[];
  labels: string[];
  commitMessage?: string;
} {
  return JSON.parse(readFileSync(SEED_PATH, "utf8"));
}

// Arbitrary but fixed, matching the format `router.ts` builds
// (`"<Weekday>, <ISO 8601>"`) — the exact value doesn't matter here since it
// is passed identically to both sides.
const FIXED_DATETIME = "Tuesday, 2026-07-21T12:00:00.000Z";

describe("search-bar-filter prompt seed", () => {
  it("names itself the same as the code constant, so a rename in one place can't silently degrade every request to permanent fallback", () => {
    const seed = loadSeed();
    expect(seed.name).toBe(SEARCH_BAR_FILTER_PROMPT_NAME);
  });

  it("is a chat prompt with exactly one system message", () => {
    const seed = loadSeed();
    expect(seed.type).toBe("chat");
    expect(seed.prompt).toHaveLength(1);
    expect(seed.prompt[0].role).toBe("system");
  });

  it("compiles byte-for-byte identical to buildFilterSystemPrompt, given the same registry-derived variables", () => {
    const seed = loadSeed();

    // The same client class `getPrompt(..., { type: "chat" })` yields —
    // constructed directly from the committed seed rather than fetched, but
    // `.compile()` runs the identical mustache-render code path the app
    // hits on every managed-prompt request.
    const client = new ChatPromptClient({
      ...seed,
      type: "chat",
      version: 1,
      config: {},
      tags: [],
    });

    const compiled = client.compile({
      catalog: buildFieldCatalog(),
      nullable_ids: nullableFieldIds(),
      current_datetime: FIXED_DATETIME,
    }) as ChatMessage[];

    expect(compiled).toHaveLength(1);
    const [compiledMessage] = compiled;
    expect(compiledMessage.role).toBe("system");

    const codePrompt = buildFilterSystemPrompt(FIXED_DATETIME);

    expect(Buffer.byteLength(compiledMessage.content, "utf8")).toBe(
      Buffer.byteLength(codePrompt, "utf8"),
    );
    expect(compiledMessage.content).toBe(codePrompt);
  });
});
