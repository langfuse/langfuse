import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
  PYTHON_CODE_EVAL_CONTRACT,
  TYPESCRIPT_CODE_EVAL_CONTRACT,
  formatAndStripCodeEvalSourceForSubmit,
  formatPythonCodeEvalSourceWithRuff,
  getCodeEvalSourceForEditor,
  getDefaultCodeEvalSource,
  isDefaultCodeEvalSource,
  validateCodeEvalSourceWithLanguage,
} from "@/src/features/evals/utils/code-eval-template-validation";

vi.mock("@astral-sh/ruff-wasm-web", () => ({
  default: async () => ({}),
  PositionEncoding: { Utf16: 1 },
  Workspace: class {
    check(contents: string) {
      if (!contents.includes("missing_name")) return [];

      return [
        {
          code: "F821",
          message: "Undefined name `missing_name`",
          start_location: { row: 2, column: 12 },
          end_location: { row: 2, column: 24 },
          fix: null,
        },
      ];
    }

    format(contents: string) {
      return contents
        .replace(" return", "    return")
        .replace("{'scores':[]}", '{"scores": []}');
    }
  },
}));

describe("code eval template validation", () => {
  it("keeps language defaults distinct", () => {
    expect(getDefaultCodeEvalSource("TYPESCRIPT")).toBe(
      DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
    );
    expect(getDefaultCodeEvalSource("PYTHON")).toBe(
      DEFAULT_PYTHON_CODE_EVAL_SOURCE,
    );
    expect(isDefaultCodeEvalSource(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE)).toBe(
      true,
    );
    expect(isDefaultCodeEvalSource(DEFAULT_PYTHON_CODE_EVAL_SOURCE)).toBe(true);
    expect(DEFAULT_PYTHON_CODE_EVAL_SOURCE).toMatch(
      /^def evaluate\(ctx: EvaluationContext\) -> EvaluationResult:/,
    );
    expect(DEFAULT_PYTHON_CODE_EVAL_SOURCE).not.toContain(
      "from dataclasses import dataclass",
    );
    expect(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE).toMatch(
      /^function evaluate\(ctx: EvaluationContext\): EvaluationResult/,
    );
    expect(DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE).not.toContain(
      "type EvaluationContext =",
    );
  });

  it("strips pasted contracts before submit", async () => {
    expect(
      await formatAndStripCodeEvalSourceForSubmit({
        sourceCode: `${TYPESCRIPT_CODE_EVAL_CONTRACT}\n\n${DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE}`,
        sourceCodeLanguage: "TYPESCRIPT",
      }),
    ).toMatch(/^function evaluate\(ctx: EvaluationContext\)/);
    expect(
      await formatAndStripCodeEvalSourceForSubmit({
        sourceCode: `${PYTHON_CODE_EVAL_CONTRACT}\n\n${DEFAULT_PYTHON_CODE_EVAL_SOURCE}`,
        sourceCodeLanguage: "PYTHON",
      }),
    ).toMatch(/^def evaluate\(ctx: EvaluationContext\)/);
  });

  it("hydrates the editor without the contract types", () => {
    const source =
      "function evaluate(ctx: EvaluationContext): EvaluationResult { return { scores: [] }; }";

    expect(
      getCodeEvalSourceForEditor({
        sourceCode: source,
        sourceCodeLanguage: "TYPESCRIPT",
      }),
    ).toBe(source);
    expect(
      getCodeEvalSourceForEditor({
        sourceCode: `${TYPESCRIPT_CODE_EVAL_CONTRACT}\n\n${source}`,
        sourceCodeLanguage: "TYPESCRIPT",
      }),
    ).toBe(source);
  });

  it("accepts the default TypeScript source", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);
  });

  it("accepts async TypeScript evaluate functions with timers", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
type TimerHandle = unknown;
type URLSearchParamsInit = string;

async function evaluate(ctx: EvaluationContext): Promise<EvaluationResult> {
  const timer: TimerHandle = setTimeout(() => {}, 1);
  clearTimeout(timer);
  const interval: TimerHandle = setInterval(() => {}, 1);
  clearInterval(interval);
  const paramsInit: URLSearchParamsInit = "source=eval";
  const params = new URLSearchParams(paramsInit);
  await new Promise((resolve) => setTimeout(resolve, params.has("source") ? 1 : 2));
  const allValues = await Promise.all([Promise.resolve(1), Promise.resolve(2)]);
  const settled = await Promise.allSettled([Promise.resolve("ok"), Promise.reject("no")]);
  const raced = await Promise.race([Promise.resolve(3)]);
  const anyValue = await Promise.any([Promise.reject("no"), Promise.resolve(4)]);
  const slicedValues = allValues.slice(0, 2);
  const firstLargeValue = slicedValues.find((value) => value > 1) ?? 0;
  let iteratedTotal = 0;
  slicedValues.forEach((value) => {
    iteratedTotal = iteratedTotal + value;
  });
  const arrayScore =
    slicedValues.reduce((total, value) => total + value, 0) +
    (slicedValues.every((value) => value > 0) ? 1 : 0) +
    (slicedValues.some((value) => value > 1) ? 1 : 0) +
    (Array.isArray(slicedValues) ? 1 : 0) +
    firstLargeValue +
    iteratedTotal;

  return {
    scores: [{
      name: "async helpers",
      value: arrayScore + settled.length + raced + anyValue,
      dataType: "NUMERIC",
    }],
  };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);
  });

  it("accepts simple Node runtime globals and keeps process unavailable", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  const url = new URL("https://user:pass@langfuse.com:443/docs?source=eval#section");
  const urlScore =
    url.origin.length +
    url.protocol.length +
    url.host.length +
    url.port.length +
    url.username.length +
    url.password.length +
    url.hash.length;
  const params = new URLSearchParams([["source", "eval"]]);
  const paramsCopy = new URLSearchParams(params);
  paramsCopy.append("next", "true");
  paramsCopy.set("source", "code");
  paramsCopy.delete("missing");
  let paramsScore = paramsCopy.has("source") ? (paramsCopy.get("source") ?? "").length : 0;
  paramsCopy.forEach((value, key) => {
    paramsScore = paramsScore + value.length + key.length;
  });
  const encoded = new TextEncoder().encode(url.hostname);
  const sliced = encoded.slice(0, 4).subarray(0, 2);
  let byteTotal = 0;
  sliced.forEach((value) => {
    byteTotal = byteTotal + value;
  });
  const copy = structuredClone({ length: encoded.length });
  queueMicrotask(() => {});

  return { scores: [{ name: "encoded", value: copy.length + byteTotal + paramsScore + urlScore, dataType: "NUMERIC" }] };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);

    const processResult = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  return { scores: [{ name: "env", value: process.env.NODE_ENV ?? "", dataType: "TEXT" }] };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(processResult.hasErrors).toBe(true);
    expect(
      processResult.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Cannot find name 'process'"),
      ),
    ).toBe(true);
  });

  it("accepts basic TypeScript string and regular expression helpers", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  const rawValue = String(ctx.observation.output ?? "");
  const normalized = rawValue.trim().toLowerCase();
  const idMatch = normalized.match(/id:(\\d+)/);
  const id = idMatch?.[1]?.substring(0, 8) ?? "missing";
  const hasTicket = new RegExp("ticket-[0-9]+", "i").test(normalized);
  const tokens = normalized.replace(/\\s+/g, " ").split(" ");
  tokens.push("fallback");
  tokens.sort();
  const copiedTokens = tokens.toSorted().toReversed().toSpliced(0, 1, "copy");
  const replacedTokens = copiedTokens.with(0, "first");
  const shiftedTokens = replacedTokens.slice();
  shiftedTokens.copyWithin(0, 1);
  const removedTokens = shiftedTokens.splice(0, 1);
  const firstToken = tokens.at(0) ?? "";
  const scoreToken = tokens.find((token) => token.includes("score")) ?? "";
  const scoreTokenIndex = tokens.findIndex((token) => token.includes("score"));
  const tokenPosition = tokens.indexOf(scoreToken);
  const reversedTokens = tokens.slice().reverse();
  const containsExact = normalized.includes("exact");
  const startsWithPass = normalized.startsWith("pass");
  const endsWithDone = normalized.endsWith("done");
  const indexScore = normalized.indexOf("score");
  const sliced = normalized.slice(0, 10);
  const tokenLengths = Object.fromEntries(
    tokens.map((token) => [token, token.length]),
  );
  const objectScore =
    Object.keys(tokenLengths).length +
    Object.values(tokenLengths).reduce((total, value) => total + value, 0) +
    Object.entries(tokenLengths).length +
    (Object.hasOwn(tokenLengths, firstToken) ? 1 : 0);

  return {
    scores: [{
      name: "string helpers",
      value: [
        id,
        firstToken,
        sliced,
        scoreToken,
        String(
          scoreTokenIndex +
            tokenPosition +
            reversedTokens.length +
            objectScore +
            removedTokens.length +
            shiftedTokens.length,
        ),
      ].join(":"),
      dataType: "TEXT",
      comment: containsExact || startsWithPass || endsWithDone || hasTicket || indexScore >= 0
        ? "matched"
        : "not matched",
    }],
  };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);
  });

  it("accepts helpers for JSON and tool call argument checks", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  const rawToolCalls = JSON.stringify(
    ctx.observation.output?.toolCalls ?? [],
    undefined,
    2,
  );
  const toolCalls = JSON.parse(rawToolCalls);
  const toolNames = Array.from(
    new Set(
      toolCalls.map((toolCall: any) =>
        String(toolCall.name ?? "").trim().toLocaleLowerCase(),
      ),
    ),
  );
  const argsByName = new Map<string, any>(
    toolCalls.map((toolCall: any) => [
      String(toolCall.name ?? "").toLowerCase(),
      toolCall.arguments ?? {},
    ]),
  );
  const weatherArgs = Object.assign(
    { units: "celsius" },
    argsByName.get("get_weather") ?? {},
  );
  const encodedName = encodeURIComponent("get weather");
  const decodedName = decodeURIComponent(encodedName).replace(" ", "_");
  const encodedUrl = encodeURI("https://langfuse.com/docs?topic=tool calls");
  const decodedUrl = decodeURI(encodedUrl);
  const params = new URL(decodedUrl).searchParams;
  params.append("tool", decodedName);
  params.append("tool", "validate");
  params.sort();
  const paramNames = Array.from(params.keys());
  const paramValues = Array.from(params.values());
  const paramEntries = Array.from(params.entries());
  const sealedArgs = Object.seal(weatherArgs);
  const frozenArgs = Object.freeze(sealedArgs);
  const hasLocation =
    Object.hasOwn(frozenArgs, "location") &&
    frozenArgs.hasOwnProperty("location") &&
    frozenArgs.propertyIsEnumerable("units") &&
    String(weatherArgs.location ?? "").padStart(1).localeCompare("") > 0;
  const uniqueToolCount = toolNames.length;
  const hasSearchTool = toolNames.includes("search");
  const hasWeatherTool =
    argsByName.has("get_weather") &&
    Object.getOwnPropertyNames(frozenArgs).includes("units") &&
    frozenArgs.toString().includes("Object") &&
    Object.is(frozenArgs.valueOf(), frozenArgs) &&
    params.getAll("tool").includes("validate") &&
    paramNames.includes("tool") &&
    paramValues.includes(decodedName) &&
    paramEntries.some((entry) => entry.join("=").includes("tool="));

  try {
    JSON.parse("{");
  } catch (error) {
    const message = error instanceof Error ? error.message.padEnd(1) : "parse failed";
    console.warn(message);
  }

  return {
    scores: [{
      name: "tool call arguments",
      value: hasLocation && hasWeatherTool && !hasSearchTool,
      dataType: "BOOLEAN",
      metadata: {
        uniqueToolCount,
        toolNames,
        normalizedUnits: String(weatherArgs.units ?? "").toUpperCase(),
        urlTopic: params.get("topic"),
      },
    }],
  };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);
  });

  it("accepts helpers for numeric scoring and normalized comparisons", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  const values = [["1.5", "2"], ["3.25"]]
    .flat()
    .flatMap((value) => [Number.parseFloat(value), parseFloat(value)]);
  const finiteValues = values.filter((value) => Number.isFinite(value) && isFinite(value));
  const total = finiteValues.reduce((sum, value) => sum + value, 0);
  const average = total / Math.max(1, finiteValues.length);
  const rounded =
    Math.floor(average) +
    Math.ceil(average) +
    Math.round(average) +
    Math.trunc(average) +
    Math.sqrt(Math.pow(average, 2));
  const expectedCount = Number.parseInt("6", 10) + parseInt("0", 10);
  const normalizedActual = String(ctx.observation.output ?? "").normalize("NFKC");
  const normalizedExpected = String(ctx.experiment?.itemExpectedOutput ?? "").normalize("NFKC");
  const sameOutput = normalizedActual.localeCompare(normalizedExpected) === 0;
  const parsedDate = Date.parse("2026-01-01T00:00:00.000Z");
  const date = new Date(parsedDate);
  const utcDate = new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6));
  const adjustedDate = new Date("2026-01-01T00:00:00.000Z");
  adjustedDate.setUTCDate(adjustedDate.getUTCDate() + 1);
  adjustedDate.setUTCHours(3, 4, 5, 6);
  const elapsedMs = utcDate.getTime() - date.valueOf();
  const sameDay =
    adjustedDate.getUTCFullYear() === utcDate.getUTCFullYear() &&
    adjustedDate.getUTCMonth() === utcDate.getUTCMonth() &&
    adjustedDate.getUTCDate() === utcDate.getUTCDate();
  const dateComment = [
    utcDate.toISOString(),
    utcDate.toUTCString(),
    utcDate.toDateString(),
    utcDate.toTimeString(),
    utcDate.toJSON(),
    String(Date.now()).slice(0, 1),
  ].join("|");
  const numericComment = Number.isInteger(expectedCount)
    ? rounded.toFixed(2) + dateComment
    : rounded.toPrecision(2);

  return {
    scores: [{
      name: "normalized numeric comparison",
      value: sameOutput && finiteValues.length === expectedCount && !Number.isNaN(parsedDate) && !isNaN(date.getTime()) && sameDay && elapsedMs > 0,
      dataType: "BOOLEAN",
      comment: numericComment,
    }],
  };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);
  });

  it("accepts helpers for deep JSON diffs and nested payload inspection", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  const seen = new WeakSet<object>();
  const visits = new WeakMap<object, number>();
  const deepEqual = (a: any, b: any): boolean => {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || a === null) return false;
    if (typeof b !== "object" || b === null) return false;
    if (seen.has(a)) return true;
    seen.add(a);
    visits.set(a, (visits.get(a) ?? 0) + 1);
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false;
      }
      return a.every((value: any, index: number) => deepEqual(value, b[index]));
    }
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(
        (key: string, index: number) =>
          key === bKeys[index] && deepEqual(a[key], b[key]),
      )
    );
  };

  const actual = JSON.parse(
    JSON.stringify(ctx.observation.output ?? { toolCalls: [] }),
    (_key: string, value: any) =>
      typeof value === "string" ? value.trim() : value,
  );
  const expected = JSON.parse(
    JSON.stringify(ctx.experiment?.itemExpectedOutput ?? { toolCalls: [] }),
  );

  const toolCalls: any[] = Array.isArray(actual.toolCalls)
    ? actual.toolCalls
    : [];
  const nestedArgs = toolCalls
    .flatMap((toolCall: any) => Object.values(toolCall.arguments ?? {}))
    .flat();
  const lastToolCall = toolCalls.findLast((toolCall: any) =>
    Object.hasOwn(toolCall ?? {}, "arguments"),
  );
  const lastToolIndex = toolCalls.findLastIndex((toolCall: any) =>
    Object.hasOwn(toolCall ?? {}, "arguments"),
  );

  const ids = Array.from(
    JSON.stringify(actual).matchAll(/"id":\\s*"([^"]+)"/g),
  ).map((match) => match[1]);
  const idScore = ids
    .map((id: string) => id.at(0)?.codePointAt(0) ?? 0)
    .fill(0, ids.length)
    .reduceRight((sum: number, value: number) => sum + Math.sign(value), 0);

  const marker = String.fromCharCode(67) + String.fromCodePoint(72);
  const withinSafeRange =
    nestedArgs.length <= Number.MAX_SAFE_INTEGER &&
    nestedArgs.length >= Number.MIN_SAFE_INTEGER &&
    Number.isSafeInteger(lastToolIndex) &&
    Math.abs(idScore) < Number.MAX_VALUE + Number.EPSILON;

  return {
    scores: [{
      name: "deep payload diff",
      value:
        deepEqual(actual, expected) && withinSafeRange && Boolean(lastToolCall),
      dataType: "BOOLEAN",
      comment: marker + ":" + String(nestedArgs.length + idScore),
    }],
  };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(false);
  });

  it("keeps non-deterministic Math.random unavailable", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  return {
    scores: [{
      name: "random",
      value: Math.random(),
      dataType: "NUMERIC",
    }],
  };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Property 'random' does not exist"),
      ),
    ).toBe(true);
  });

  it("requires Array.from before using array helpers on iterators", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
function evaluate(ctx: EvaluationContext): EvaluationResult {
  const params = new URLSearchParams("tool=validate");
  const hasTool = params.keys().includes("tool");
  const ids = JSON.stringify(ctx.observation.output ?? {})
    .matchAll(/"id":\\s*"([^"]+)"/g)
    .map((match) => match[1]);

  return {
    scores: [{
      name: "iterator helpers",
      value: hasTool && ids.length > 0,
      dataType: "BOOLEAN",
    }],
  };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Property 'includes' does not exist"),
      ),
    ).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Property 'map' does not exist"),
      ),
    ).toBe(true);
  });

  it("rejects exported TypeScript evaluate functions", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
export function evaluate(ctx: EvaluationContext): EvaluationResult {
  return { scores: [] };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Exports are not supported"),
      ),
    ).toBe(true);
  });

  it("uses Ruff diagnostics for Python source", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: "def evaluate(ctx):\n    return missing_name\n",
      sourceCodeLanguage: "PYTHON",
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("F821"),
      ),
    ).toBe(true);
  });

  it("rejects default exported TypeScript evaluate functions", async () => {
    const result = await validateCodeEvalSourceWithLanguage({
      source: `${TYPESCRIPT_CODE_EVAL_CONTRACT}
export default function evaluate(): EvaluationResult {
  return { scores: [] };
}
`,
      sourceCodeLanguage: "TYPESCRIPT",
    });

    expect(result.hasErrors).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.message.includes("Exports are not supported"),
      ),
    ).toBe(true);
  });

  it("formats Python source with Ruff", async () => {
    await expect(
      formatPythonCodeEvalSourceWithRuff(
        "def evaluate(ctx):\n return {'scores':[]}\n",
      ),
    ).resolves.toContain('"scores": []');
  });
});
