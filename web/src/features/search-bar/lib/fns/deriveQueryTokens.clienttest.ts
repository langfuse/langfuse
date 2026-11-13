import { describe, expect, it, vi } from "vitest";
import { deriveQueryTokens } from "./deriveQueryTokens";
import { EVENTS_FIELD_REGISTRY } from "../fields";
import * as validation from "../validate";
import { createTokenFacetState } from "./tokenFacet";

describe("deriveQueryTokens", () => {
  it("keeps complete two-value collections interactive without compacting their source", () => {
    for (const expression of [
      "name:(alpha OR beta)",
      "-name:(alpha OR beta)",
      "tags:(alpha AND beta)",
      "NOT (name:(alpha OR beta))",
    ]) {
      const draft = `${expression} level:ERROR`;
      const token = deriveQueryTokens({
        draft,
        scoreTypes: undefined,
        registry: EVENTS_FIELD_REGISTRY,
        showDiagnostics: true,
        fieldReason: undefined,
        freeTextReason: undefined,
      }).find((candidate) => candidate.raw.includes("alpha"));
      const raw = expression.includes("AND")
        ? "(alpha AND beta)"
        : "(alpha OR beta)";
      const from = draft.indexOf(raw);
      expect(token?.collection).toMatchObject({
        compact: false,
        values: ["alpha", "beta"],
        atom: { raw, from, to: from + raw.length },
      });
      expect(
        createTokenFacetState(draft, token!, EVENTS_FIELD_REGISTRY),
      ).not.toBe(null);
    }
    for (const draft of [
      "name:(alpha OR beta",
      "name:alpha",
      "name:=alpha",
      "name:(alpha)",
      "name:alpha,beta",
    ]) {
      expect(
        deriveQueryTokens({
          draft,
          scoreTypes: undefined,
          registry: EVENTS_FIELD_REGISTRY,
          showDiagnostics: true,
          fieldReason: undefined,
          freeTextReason: undefined,
        }).every((token) => token.collection === undefined),
      ).toBe(true);
    }
  });

  it("keeps a complete value list folded while its key is unknown without hiding value errors", () => {
    const project = (draft: string, registry = EVENTS_FIELD_REGISTRY) =>
      deriveQueryTokens({
        draft,
        scoreTypes: undefined,
        registry,
        showDiagnostics: true,
        fieldReason: undefined,
        freeTextReason: undefined,
      });
    for (const values of ["alpha OR beta", "alpha OR beta OR gamma"]) {
      for (const key of ["n", "unknown.field", ""]) {
        const raw = `(${values})`;
        const draft = `${key}:${raw}`;
        const [token] = project(draft);
        expect(token?.kind).toBe("invalid");
        expect(token?.error).toContain(`Unknown field "${key}"`);
        expect(
          validation
            .validateQuery(draft)
            .diagnostics.every(
              (diagnostic) => diagnostic.code === "unknown-field",
            ),
        ).toBe(true);
        expect(token?.collection?.atom).toEqual({
          from: key.length + 1,
          to: draft.length,
          raw,
        });
      }
    }
    for (const draft of [
      "latency:(alpha OR beta OR gamma)",
      "name:(alpha OR beta OR)",
      "n:(alpha OR beta OR)",
    ]) {
      expect(
        project(draft).every((token) => token.collection === undefined),
      ).toBe(true);
    }
    expect(
      project('"Unavailable".name:(alpha OR beta OR gamma)', {
        ...EVENTS_FIELD_REGISTRY,
        targeting: {
          defaultTarget: "all",
          supports: () => true,
          targets: [{ id: "all", label: "All", keyword: true }],
        },
      }).every((token) => token.collection === undefined),
    ).toBe(true);

    const draft = "reworded:(alpha OR beta OR gamma)";
    const result = validation.validateQuery(draft);
    const reworded = vi.spyOn(validation, "validateQuery").mockReturnValue({
      ...result,
      diagnostics: result.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        code: "unknown-field" as const,
        message: "This field name is not recognized",
      })),
    });
    try {
      const [token] = project(draft);
      expect(token?.error).toBe("This field name is not recognized");
      expect(token?.collection?.atom.raw).toBe("(alpha OR beta OR gamma)");
    } finally {
      reworded.mockRestore();
    }
  });

  it("folds only value source while leaving keys, negation, and targets outside the atom", () => {
    const registry = {
      ...EVENTS_FIELD_REGISTRY,
      targeting: {
        defaultTarget: "all",
        supports: () => true,
        targets: [
          { id: "all", label: "All", keyword: true },
          { id: "run-a", label: "Run: A" },
        ],
      },
    };
    for (const [expression, valueSource] of [
      ["name:(alpha OR beta OR gamma)", "(alpha OR beta OR gamma)"],
      ["-name:(alpha OR beta OR gamma)", "(alpha OR beta OR gamma)"],
      ["tags:(alpha AND beta AND gamma)", "(alpha AND beta AND gamma)"],
      ["NOT (name:(alpha OR beta OR gamma))", "(alpha OR beta OR gamma)"],
      [
        '\"Run: A\".scores.\"Rouge: Score\":(alpha OR beta OR gamma)',
        "(alpha OR beta OR gamma)",
      ],
      [
        '-scores.\"Rouge: Score\":(alpha OR beta OR gamma) @\"Run: A\"',
        "(alpha OR beta OR gamma)",
      ],
      ["name:alpha,beta,gamma", "alpha,beta,gamma"],
    ]) {
      const draft = `level:ERROR ${expression} env:dev`;
      const token = deriveQueryTokens({
        draft,
        scoreTypes: undefined,
        registry,
        showDiagnostics: true,
        fieldReason: undefined,
        freeTextReason: undefined,
      }).find((candidate) => candidate.collection !== undefined)!;
      const from = draft.indexOf(valueSource!);
      const to = from + valueSource!.length;
      expect(token.collection?.atom).toEqual({ from, to, raw: valueSource });
      const prefix = token
        .collection!.groups[0]!.parts.map((part) => part.text)
        .join("");
      const suffix = token
        .collection!.groups.slice(2)
        .flatMap((group) => group.parts.map((part) => part.text))
        .join("");
      expect(prefix + valueSource + suffix).toBe(token.raw);
      expect(
        draft.slice(0, from) + token.collection!.atom.raw + draft.slice(to),
      ).toBe(draft);
    }
  });

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
      expect(token?.collection?.values).toEqual(["alpha", "beta", "gamma"]);
      expect(token?.collection?.label).toContain(`${relation} 3 values`);
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
    const group = tokens.find((token) => token.collection !== undefined);
    expect(group?.collection?.label).toBe("Name none of 3 values");
    expect(group?.raw).toBe(draft.slice(group?.from, group?.to));
    expect(group?.collection?.groups[1]?.parts).toEqual([
      { text: "alpha", tone: "value" },
    ]);
    expect(
      createTokenFacetState(draft, group!, EVENTS_FIELD_REGISTRY),
    ).not.toBe(null);
  });

  it("keeps collections under compound NOT editable when the picker cannot isolate them", () => {
    for (const draft of [
      "NOT (name:(alpha OR beta OR gamma) level:ERROR)",
      "NOT NOT (name:(alpha OR beta OR gamma) level:ERROR)",
      "NOT (name:(alpha OR beta OR gamma) OR name:delta)",
    ]) {
      const tokens = deriveQueryTokens({
        draft,
        scoreTypes: undefined,
        registry: EVENTS_FIELD_REGISTRY,
        showDiagnostics: false,
        fieldReason: undefined,
        freeTextReason: undefined,
      });
      const collection = tokens.find((token) => token.raw.startsWith("name:"))!;
      expect(collection.raw).toBe("name:(alpha OR beta OR gamma)");
      expect(
        createTokenFacetState(draft, collection, EVENTS_FIELD_REGISTRY),
      ).toBe(null);
      expect(collection.editable).toBe(true);
      expect(collection.collection).toBeUndefined();
    }
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
