import { describe, expect, it } from "vitest";
import { deriveQueryTokens } from "./deriveQueryTokens";
import { EVENTS_FIELD_REGISTRY } from "../fields";

describe("deriveQueryTokens", () => {
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
      expect(
        token?.summary?.groups
          .flatMap((group) => group.parts.map((part) => part.text))
          .join(""),
      ).toContain("[alpha +2]");
      expect(token?.raw).toBe(draft);
      expect(
        token?.groups
          ?.flatMap((group) => group.parts.map((part) => part.text))
          .join(""),
      ).toBe(draft);
    },
  );

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
