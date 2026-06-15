import type { ASTNode } from "@/src/features/search-bar/lib/ast";
import { parse, serialize, termAt } from "@/src/features/search-bar/lib/langQ";
import {
  removeToken,
  tidyQueryText,
} from "@/src/features/search-bar/lib/edits";
import { validateQuery } from "@/src/features/search-bar/lib/validate";

/** Structural copy without spans, for deep-equal comparisons. */
function strip(node: ASTNode | null): unknown {
  if (node === null) return null;
  switch (node.kind) {
    case "filter":
      return {
        kind: "filter",
        key: node.key,
        op: node.op,
        values: node.values,
        ...(node.valueOp === "and" ? { valueOp: "and" } : {}),
      };
    case "text":
      return { kind: "text", value: node.value };
    case "not":
      return { kind: "not", child: strip(node.child) };
    case "and":
    case "or":
      return { kind: node.kind, children: node.children.map(strip) };
  }
}

describe("langQ parser", () => {
  it("resolves aliases to canonical field ids", () => {
    const r = parse("env:prod");
    expect(r.valid).toBe(true);
    expect(strip(r.ast)).toEqual({
      kind: "filter",
      key: "environment",
      op: "=",
      values: ["prod"],
    });
  });

  it("parses grouped lists, comma lists, comparisons, and quoted values", () => {
    expect(strip(parse("level:(ERROR OR WARNING)").ast)).toEqual({
      kind: "filter",
      key: "level",
      op: "=",
      values: ["ERROR", "WARNING"],
    });
    expect(strip(parse("level:ERROR,WARNING").ast)).toEqual({
      kind: "filter",
      key: "level",
      op: "=",
      values: ["ERROR", "WARNING"],
    });
    expect(strip(parse("latency:>2.5").ast)).toEqual({
      kind: "filter",
      key: "latency",
      op: ">",
      values: ["2.5"],
    });
    expect(strip(parse('name:"hello world"').ast)).toEqual({
      kind: "filter",
      key: "name",
      op: "=",
      values: ["hello world"],
    });
  });

  it("parses all-of value groups on array fields", () => {
    expect(strip(parse("tags:(a AND b)").ast)).toEqual({
      kind: "filter",
      key: "traceTags",
      op: "=",
      values: ["a", "b"],
      valueOp: "and",
    });
  });

  it("preserves metadata dot-path key case", () => {
    expect(strip(parse("metadata.Region:eu").ast)).toEqual({
      kind: "filter",
      key: "metadata.Region",
      op: "=",
      values: ["eu"],
    });
  });

  it("mixes free text with filters via implicit AND", () => {
    expect(strip(parse("timeout level:ERROR").ast)).toEqual({
      kind: "and",
      children: [
        { kind: "text", value: "timeout" },
        { kind: "filter", key: "level", op: "=", values: ["ERROR"] },
      ],
    });
  });

  it("binds implicit AND tighter than OR and parses NOT/- negation", () => {
    expect(strip(parse("a:1 b:2 OR c:3").ast)).toMatchObject({
      kind: "or",
    });
    expect(strip(parse("-env:dev").ast)).toEqual({
      kind: "not",
      child: {
        kind: "filter",
        key: "environment",
        op: "=",
        values: ["dev"],
      },
    });
    expect(strip(parse("NOT level:DEBUG").ast)).toEqual({
      kind: "not",
      child: { kind: "filter", key: "level", op: "=", values: ["DEBUG"] },
    });
  });

  it("parses explicit string operators", () => {
    expect(strip(parse("name:~chat").ast)).toMatchObject({ op: "~" });
    expect(strip(parse("input:^How").ast)).toMatchObject({ op: "^" });
    expect(strip(parse("output:$end").ast)).toMatchObject({ op: "$" });
    expect(strip(parse("name:=exact").ast)).toMatchObject({ op: "exact" });
  });

  it("tokenizes the * operator but flags it as unsupported", () => {
    const r = parse('input:*"refund policy"');
    expect(strip(r.ast)).toMatchObject({ op: "*" });
    expect(r.valid).toBe(false);
  });

  it("flags unknown fields with an error diagnostic", () => {
    const r = parse("nope:1");
    expect(r.valid).toBe(false);
    expect(r.diagnostics.some((d) => d.message.includes('"nope"'))).toBe(true);
  });

  it("flags structural issues without throwing", () => {
    for (const text of [
      "level:",
      "level:(ERROR",
      '"unclosed',
      "(env:dev",
      "env:dev)",
      "NOT",
      "AND",
      "level:ERROR OR",
      "tags:(a OR b AND c)",
      "-freetext",
    ]) {
      const r = parse(text);
      expect(r.valid).toBe(false);
    }
  });

  it("keeps spans pointing at source slices", () => {
    const text = "timeout level:ERROR";
    const r = parse(text);
    expect(r.ast?.kind).toBe("and");
    if (r.ast?.kind !== "and") return;
    const [t, f] = r.ast.children;
    expect(t?.kind === "text" && text.slice(t.span!.from, t.span!.to)).toBe(
      "timeout",
    );
    expect(f?.kind === "filter" && text.slice(f.span!.from, f.span!.to)).toBe(
      "level:ERROR",
    );
  });

  it("termAt is quote-aware (one token across quoted spaces)", () => {
    const text = 'name:"hello world" x';
    expect(termAt(text, 8)?.raw).toBe('name:"hello world"');
  });

  it("treats unicode whitespace (NBSP) as a token separator", () => {
    const r = parse("level:ERROR env:dev");
    expect(strip(r.ast)).toEqual({
      kind: "and",
      children: [
        { kind: "filter", key: "level", op: "=", values: ["ERROR"] },
        { kind: "filter", key: "environment", op: "=", values: ["dev"] },
      ],
    });
  });
});

describe("langQ serializer", () => {
  it("round-trips canonical text", () => {
    for (const text of [
      "level:ERROR",
      "level:(ERROR OR WARNING)",
      "-env:dev",
      "latency:>2",
      'name:"hello world"',
      "tags:(a AND b)",
      "timeout level:ERROR",
      "has:endTime",
      "-has:endTime",
      "metadata.region:eu",
      "scores.accuracy:>0.8",
    ]) {
      const first = parse(text);
      expect(first.valid).toBe(true);
      const canonical = serialize(first.ast);
      const second = parse(canonical);
      expect(strip(second.ast)).toEqual(strip(first.ast));
    }
  });

  it("escaped quotes and backslashes round-trip", () => {
    const node: ASTNode = {
      kind: "filter",
      key: "name",
      op: "=",
      values: ['say "hi" \\ done'],
    };
    const text = serialize(node);
    const r = parse(text);
    expect(strip(r.ast)).toEqual({
      kind: "filter",
      key: "name",
      op: "=",
      values: ['say "hi" \\ done'],
    });
  });

  it("collapses same-field OR chains into grouped values", () => {
    const r = parse("level:ERROR OR level:WARNING");
    expect(serialize(r.ast)).toBe("level:(ERROR OR WARNING)");
  });

  it("quotes values that would otherwise reparse as operators or keywords", () => {
    // Values starting with an operator prefix, equal to a boolean keyword, or
    // empty must round-trip through serialize → parse unchanged.
    for (const value of [
      ">5",
      "~foo",
      "=eq",
      "^x",
      "$y",
      "*z",
      "OR",
      "AND",
      "NOT",
      "",
    ]) {
      const node: ASTNode = {
        kind: "filter",
        key: "name",
        op: "=",
        values: [value],
      };
      const r = parse(serialize(node));
      expect(r.valid, `value ${JSON.stringify(value)} must round-trip`).toBe(
        true,
      );
      expect(strip(r.ast)).toEqual({
        kind: "filter",
        key: "name",
        op: "=",
        values: [value],
      });
    }
  });

  it("keeps a keyword value inside an any-of group", () => {
    const node: ASTNode = {
      kind: "filter",
      key: "name",
      op: "=",
      values: ["x", "OR"],
    };
    const r = parse(serialize(node));
    expect(r.valid).toBe(true);
    expect(strip(r.ast)).toEqual({
      kind: "filter",
      key: "name",
      op: "=",
      values: ["x", "OR"],
    });
  });

  it("does not over-quote values with mid-string hyphens or operators", () => {
    expect(serialize(parse("model:gpt-4-turbo").ast)).toBe("model:gpt-4-turbo");
  });
});

describe("edits", () => {
  it("removeToken splices when valid", () => {
    expect(removeToken("level:ERROR env:dev", { from: 0, to: 11 })).toBe(
      "env:dev",
    );
    expect(removeToken("level:ERROR env:dev", { from: 12, to: 19 })).toBe(
      "level:ERROR",
    );
  });

  it("removeToken falls back to AST surgery inside groups", () => {
    // Splicing "level:ERROR" out would leave "(OR level:WARNING)" — invalid,
    // so the edit reserializes from the surgically-edited AST instead.
    const next = removeToken("(level:ERROR OR level:WARNING)", {
      from: 1,
      to: 12,
    });
    expect(next).toBe("level:WARNING");
  });

  it("tidyQueryText strips only provably-redundant parens", () => {
    expect(tidyQueryText("(env:dev)")).toBe("env:dev");
    expect(tidyQueryText("((env:dev))  level:ERROR")).toBe(
      "env:dev level:ERROR",
    );
  });
});

describe("validateQuery", () => {
  it("accepts representable queries", () => {
    for (const text of [
      "",
      "level:ERROR",
      "level:(ERROR OR WARNING)",
      "-env:dev",
      "timeout level:ERROR",
      "latency:>2 -has:endTime",
      "scores.accuracy:>0.8",
      "traceScores.nps:positive",
      "metadata.region:~eu",
      "content:refund",
      "tags:(a AND b)",
      "isRootObservation:true",
      "-isRootObservation:true",
      "level:ERROR OR level:WARNING",
    ]) {
      const r = validateQuery(text);
      expect(r.valid, `expected valid: ${text}`).toBe(true);
    }
  });

  it("rejects forms the flat filter contract cannot represent", () => {
    for (const text of [
      "level:ERROR OR env:dev", // cross-field OR
      "NOT (level:ERROR env:dev)", // negated group
      "-latency:2", // negated numeric equality
      "-input:^prefix", // negated starts-with
      "-tags:(a AND b)", // negated all-of
      "metadata.region:>5", // metadata comparison
      "-metadata.region:eu", // negated metadata equality
      "latency:(1 OR 2)", // numeric any-of
      "has:(endTime OR userId)", // positive multi-has
      "in:nope", // bad scope
      "x:1", // unknown field
      "-(env:dev)", // standalone "-" before a group (must glue to the filter)
      "- env:dev", // stray "-" then a filter
      "metadata.", // dot-prefix field with no key
      "scores.", // dot-prefix score with no key
      "traceScores.", // dot-prefix trace score with no key
      "tags:(a,b)", // bare comma inside a group (must use OR/AND)
      "level:(ERROR,WARNING)", // same, on an option field
      "not level:ERROR", // lowercase `not` reserved (use -field:value)
      "!level:ERROR", // `!` reserved (use -field:value)
      "level:ERROR or env:dev", // lowercase `or` reserved
      "level:ERROR and env:dev", // lowercase `and` reserved
    ]) {
      const r = validateQuery(text);
      expect(r.valid, `expected invalid: ${text}`).toBe(false);
    }
  });

  it("nested AND groups behave like the top-level chain", () => {
    expect(validateQuery("(env:dev timeout)").valid).toBe(true);
    expect(validateQuery("(env:dev level:ERROR)").valid).toBe(true);
  });

  it("nested same-field OR groups collapse to any-of", () => {
    expect(validateQuery("(level:ERROR OR level:WARNING) env:dev").valid).toBe(
      true,
    );
  });

  it("warns (without blocking) on has: for non-nullable fields", () => {
    const r = validateQuery("has:level");
    expect(r.valid).toBe(true);
    expect(r.diagnostics.some((d) => d.severity === "warning")).toBe(true);
  });

  it("caps query length", () => {
    const long = `name:${"a".repeat(2100)}`;
    expect(validateQuery(long).valid).toBe(false);
  });

  it("flags a bare comma in a group with a single diagnostic, not a doubled one", () => {
    const errors = validateQuery("tags:(a,b)").diagnostics.filter(
      (d) => d.severity === "error",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/uppercase OR or AND/);
  });

  it("emits a single Unclosed-paren diagnostic for `level:(`", () => {
    const unclosed = validateQuery("level:(").diagnostics.filter((d) =>
      d.message.includes("Unclosed"),
    );
    expect(unclosed).toHaveLength(1);
  });

  it("reserves operator-looking tokens with a 'not supported yet' diagnostic", () => {
    const msgOf = (q: string) =>
      validateQuery(q)
        .diagnostics.map((d) => d.message)
        .join(" | ");
    expect(msgOf("not level:ERROR")).toMatch(/not.*not supported yet/i);
    expect(msgOf("!level:ERROR")).toMatch(/not supported yet/i);
    expect(msgOf("level:ERROR or env:dev")).toMatch(/not supported yet/i);
    // quoting escapes the reserved word back into free text
    expect(validateQuery('"not" level:ERROR').valid).toBe(true);
  });
});
