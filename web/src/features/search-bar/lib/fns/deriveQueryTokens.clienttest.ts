import { describe, expect, it } from "vitest";
import { deriveQueryTokens } from "./deriveQueryTokens";
import { EVENTS_FIELD_REGISTRY } from "../fields";

describe("deriveQueryTokens", () => {
  it("keeps an excessively complex query in one editable error region", () => {
    const draft = "bad:1 ".repeat(10000).trim();
    const tokens = deriveQueryTokens({
      draft,
      scoreTypes: undefined,
      registry: EVENTS_FIELD_REGISTRY,
      showDiagnostics: true,
      fieldReason: undefined,
      freeTextReason: undefined,
    });
    expect(tokens).toEqual([
      expect.objectContaining({
        raw: draft,
        from: 0,
        to: draft.length,
        editable: true,
        kind: "invalid",
        error: "Query has too many terms (max 1024)",
      }),
    ]);
  });

  it.each([
    { draft: "name:(alpha OR beta OR gamma)", relation: "any of" },
    { draft: "-name:(alpha OR beta OR gamma)", relation: "none of" },
    { draft: "tags:(alpha AND beta AND gamma)", relation: "all of" },
  ])(
    "summarizes $relation values without changing the source",
    ({ draft, relation }) => {
      const [token] = deriveQueryTokens({
        draft,
        scoreTypes: undefined,
        registry: EVENTS_FIELD_REGISTRY,
        showDiagnostics: true,
        fieldReason: undefined,
        freeTextReason: undefined,
      });
      expect(token?.summary?.values).toEqual(["alpha", "beta", "gamma"]);
      expect(token?.summary?.label).toContain(`${relation} 3 values`);
      expect(token?.raw).toBe(draft);
      expect(
        token?.groups
          ?.flatMap((group) => group.parts.map((part) => part.text))
          .join(""),
      ).toBe(draft);
    },
  );

  it("describes a value group under NOT as an exclusion while keeping its source", () => {
    const draft = "NOT (name:(alpha OR beta OR gamma))";
    const tokens = deriveQueryTokens({
      draft,
      scoreTypes: undefined,
      registry: EVENTS_FIELD_REGISTRY,
      showDiagnostics: false,
      fieldReason: undefined,
      freeTextReason: undefined,
    });
    const group = tokens.find((token) => token.summary !== undefined);
    expect(group?.summary?.label).toBe("Name none of 3 values");
    expect(group?.raw).toBe(draft.slice(group?.from, group?.to));
    expect(group?.summary?.groups[1]?.parts).toEqual([
      { text: "alpha", tone: "value" },
    ]);
  });

  it.each([
    'metadata."foo:bar":*x*',
    'scores."Rouge Score":>=1',
    "level:(ERROR OR WARNING) type:GENERATION",
    "level:ERROR hello",
    "-latency:>2",
    '-"Run: A".scores."Rouge Score":>0.8',
  ])("preserves the query text: %s", (draft) => {
    const tokens = deriveQueryTokens({
      draft,
      scoreTypes: undefined,
      registry: {
        ...EVENTS_FIELD_REGISTRY,
        targeting: {
          defaultTarget: "all",
          supports: () => true,
          targets: [
            { id: "all", label: "All", keyword: true },
            { id: "run-a", label: "Run: A", textClassName: "text-pink-500" },
          ],
        },
      },
      showDiagnostics: true,
      fieldReason: undefined,
      freeTextReason: undefined,
    });
    expect(tokens.some((token) => token.kind === "filter")).toBe(true);
    let cursor = 0;
    let text = "";
    for (const token of tokens) {
      text += draft.slice(cursor, token.from);
      text += token.groups
        ? token.groups
            .flatMap((group) => group.parts.map((part) => part.text))
            .join("")
        : token.raw;
      cursor = token.to;
    }
    expect(text + draft.slice(cursor)).toBe(draft);
  });

  it("maps revealed errors and unsupported fields without changing their text", () => {
    const tokens = deriveQueryTokens({
      draft: "level:ERROR nope:1",
      scoreTypes: undefined,
      registry: EVENTS_FIELD_REGISTRY,
      showDiagnostics: false,
      fieldReason: () => "Not supported",
      freeTextReason: undefined,
    });
    expect(tokens[0]?.inactiveReason).toBe("Not supported");
    expect(tokens[1]?.kind).toBe("freeText");
    expect(tokens[1]?.error).toBeTruthy();
  });
});
