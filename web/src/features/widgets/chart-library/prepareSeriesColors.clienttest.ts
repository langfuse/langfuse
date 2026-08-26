import { describe, expect, it } from "vitest";

import {
  matchSeriesStatus,
  prepareSeriesColors,
  seriesColor,
} from "@/src/features/widgets/chart-library/prepareSeriesColors";

const ERROR = "var(--chart-status-error)";
const WARNING = "var(--chart-status-warning)";
const OK = "var(--chart-status-ok)";
const NEUTRAL = "var(--chart-status-neutral)";

describe("matchSeriesStatus", () => {
  it("matches universal status words in any context, case-insensitively", () => {
    expect(matchSeriesStatus("ERROR")).toBe("error");
    expect(matchSeriesStatus("error")).toBe("error");
    expect(matchSeriesStatus("  Failed  ")).toBe("error");
    expect(matchSeriesStatus("warn")).toBe("warning");
    expect(matchSeriesStatus("PASS")).toBe("ok");
    expect(matchSeriesStatus("healthy")).toBe("ok");
    expect(matchSeriesStatus("n/a")).toBe("neutral");
    expect(matchSeriesStatus("Unknown")).toBe("neutral");
  });

  it("never substring-matches: unrelated values stay uncolored", () => {
    expect(matchSeriesStatus("error_handler")).toBeUndefined();
    expect(matchSeriesStatus("en")).toBeUndefined();
    expect(matchSeriesStatus("gpt-4o")).toBeUndefined();
  });

  it("gates level words on the level field — the 'default' environment stays uncolored", () => {
    expect(matchSeriesStatus("DEFAULT", { field: "level" })).toBe("ok");
    expect(matchSeriesStatus("INFO", { field: "level" })).toBe("ok");
    expect(matchSeriesStatus("DEBUG", { field: "level" })).toBe("neutral");
    // No field hint (e.g. an environment breakdown): no match.
    expect(matchSeriesStatus("default")).toBeUndefined();
    expect(matchSeriesStatus("DEFAULT")).toBeUndefined();
    expect(
      matchSeriesStatus("default", { field: "score-categorical" }),
    ).toBeUndefined();
  });

  it("gates verdict words on the score field", () => {
    const score = { field: "score-categorical" } as const;
    expect(matchSeriesStatus("correct", score)).toBe("ok");
    expect(matchSeriesStatus("hallucinated", score)).toBe("error");
    expect(matchSeriesStatus("borderline", score)).toBe("warning");
    expect(matchSeriesStatus("none", score)).toBe("neutral");
    // Ungated, these are just words.
    expect(matchSeriesStatus("correct")).toBeUndefined();
    expect(matchSeriesStatus("none")).toBeUndefined();
  });

  it("infers True/False polarity from the score name, never without one", () => {
    const negative = {
      field: "score-categorical",
      scoreName: "hallucination",
    } as const;
    expect(matchSeriesStatus("True", negative)).toBe("error");
    expect(matchSeriesStatus("False", negative)).toBe("ok");

    const positive = {
      field: "score-categorical",
      scoreName: "user-feedback",
    } as const;
    expect(matchSeriesStatus("True", positive)).toBe("ok");
    expect(matchSeriesStatus("no", positive)).toBe("error");

    // Unknown score name: no polarity guess.
    const unknown = {
      field: "score-categorical",
      scoreName: "vibe_check_9000",
    } as const;
    expect(matchSeriesStatus("True", unknown)).toBeUndefined();
    // No score name at all (multi-score chart): no polarity guess.
    expect(
      matchSeriesStatus("True", { field: "score-categorical" }),
    ).toBeUndefined();
  });

  it("checks negated stems before positive roots, and VALID never fires inside VALIDATOR", () => {
    const ctx = (scoreName: string) => ({
      field: "score-categorical" as const,
      scoreName,
    });
    // "unsafe" must not match its "safe" root.
    expect(matchSeriesStatus("True", ctx("unsafe_content"))).toBe("error");
    expect(matchSeriesStatus("True", ctx("schema_valid"))).toBe("ok");
    // Noun-form negations must not fall through to their positive root
    // ("irrelevance" contains RELEVAN — polarity would invert).
    expect(matchSeriesStatus("True", ctx("answer_irrelevance"))).toBe("error");
    expect(matchSeriesStatus("True", ctx("response_incoherence"))).toBe(
      "error",
    );
    expect(matchSeriesStatus("True", ctx("factual_inaccuracy"))).toBe("error");
    expect(matchSeriesStatus("True", ctx("noncompliance"))).toBe("error");
    expect(matchSeriesStatus("True", ctx("ungrounded_claims"))).toBe("error");
    expect(matchSeriesStatus("False", ctx("unsuccessful_resolution"))).toBe(
      "ok",
    );
    // Violation-detector names: VALIDATOR is stripped before the positive
    // scan; polarity comes from the rest of the name or not at all.
    expect(
      matchSeriesStatus("True", ctx("eval_validator_forbidden_response")),
    ).toBe("error");
    expect(
      matchSeriesStatus("True", ctx("eval_validator_empty_result")),
    ).toBeUndefined();
  });

  it("does not color high/medium/low or intent-dependent boolean names", () => {
    const ctx = { field: "score-categorical", scoreName: "risk" } as const;
    expect(matchSeriesStatus("high", ctx)).toBeUndefined();
    expect(matchSeriesStatus("medium", ctx)).toBeUndefined();
    expect(matchSeriesStatus("low", ctx)).toBeUndefined();
    for (const name of ["guardrail_blocked", "escalated", "cache_hit"]) {
      expect(
        matchSeriesStatus("True", {
          field: "score-categorical",
          scoreName: name,
        }),
      ).toBeUndefined();
    }
  });
});

describe("prepareSeriesColors", () => {
  it("keeps today's exact palette rotation when nothing matches (zero repaint)", () => {
    const dims = Array.from({ length: 10 }, (_, i) => `service-${i}`);
    const colors = prepareSeriesColors(dims);
    dims.forEach((dim, index) => {
      expect(colors.colorOf(dim)).toBe(seriesColor(index));
    });
    expect(colors.hasStatusColor).toBe(false);
  });

  it("colors the flagship level breakdown with status colors", () => {
    const colors = prepareSeriesColors(
      ["DEFAULT", "DEBUG", "WARNING", "ERROR"],
      { field: "level" },
    );
    expect(colors.colorOf("DEFAULT")).toBe(OK);
    expect(colors.colorOf("DEBUG")).toBe(NEUTRAL);
    expect(colors.colorOf("WARNING")).toBe(WARNING);
    expect(colors.colorOf("ERROR")).toBe(ERROR);
    expect(colors.hasStatusColor).toBe(true);
  });

  it("re-rotates non-semantic series over the non-status slots beside a status color", () => {
    const colors = prepareSeriesColors(["checkout", "ERROR", "search", "auth"]);
    expect(colors.colorOf("ERROR")).toBe(ERROR);
    // Non-semantic series take slots 1, 2, 4 (blue, cyan, purple) — never the
    // withheld status-lookalike slots 3/5/6/7.
    expect(colors.colorOf("checkout")).toBe("hsl(var(--chart-1))");
    expect(colors.colorOf("search")).toBe("hsl(var(--chart-2))");
    expect(colors.colorOf("auth")).toBe("hsl(var(--chart-4))");
  });

  it("neutral matches tint themselves without repainting the rest of the chart", () => {
    // "n/a" is ubiquitous (every nullable breakdown) — it must NOT narrow the
    // palette for everything else.
    const colors = prepareSeriesColors(["checkout", "n/a", "search"]);
    expect(colors.hasStatusColor).toBe(false);
    expect(colors.colorOf("n/a")).toBe(NEUTRAL);
    // Others keep their exact pre-existing slot (by original index).
    expect(colors.colorOf("checkout")).toBe(seriesColor(0));
    expect(colors.colorOf("search")).toBe(seriesColor(2));
  });

  it("returns only well-formed CSS color strings, total for unknown series", () => {
    const colors = prepareSeriesColors(["ERROR", "other-series"]);
    for (const dim of ["ERROR", "other-series", "never-seen"]) {
      expect(colors.colorOf(dim)).toMatch(
        /^(hsl\(var\(--chart-[1-8]\)\)|var\(--chart-status-(error|warning|ok|neutral)\))$/,
      );
    }
    expect(colors.statusOf("ERROR")).toBe("error");
    expect(colors.statusOf("other-series")).toBeUndefined();
  });
});
