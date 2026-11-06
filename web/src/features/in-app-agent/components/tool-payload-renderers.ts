import { deepParseJson } from "@langfuse/shared";

const MAX_PAYLOAD_DEPTH = 6;

type PayloadCode = {
  language: "python" | "typescript";
  path: string;
  value: string;
};

// Only these tool contracts contain evaluator source fields.
const CODE_TOOL_PAYLOADS: Record<string, readonly ("arguments" | "result")[]> =
  {
    langfuse_createEvaluator: ["arguments", "result"],
    langfuse_updateEvaluator: ["arguments", "result"],
    langfuse_getEvaluator: ["result"],
    langfuse_listEvaluators: ["result"],
    langfuse_testEvaluator: ["arguments"],
  };

export function unwrapMcpTextResult(value: unknown) {
  if (
    !isRecord(value) ||
    !Array.isArray(value.content) ||
    value.content.length !== 1 ||
    !isRecord(value.content[0]) ||
    value.content[0].type !== "text" ||
    typeof value.content[0].text !== "string" ||
    Object.keys(value).some((key) => key !== "content" && key !== "isError") ||
    value.isError === true
  ) {
    return value;
  }

  try {
    return JSON.parse(value.content[0].text) as unknown;
  } catch {
    return value;
  }
}

export function prepareToolPayload(
  value: unknown,
  toolName: string | undefined,
  kind: "arguments" | "result",
) {
  const customCode =
    !!toolName &&
    Object.hasOwn(CODE_TOOL_PAYLOADS, toolName) &&
    (CODE_TOOL_PAYLOADS[toolName]?.includes(kind) ?? false);
  const codes = new Map<string, PayloadCode>();
  const markers = new WeakMap<object, PayloadCode>();

  function visit(value: unknown, depth: number, path: string): unknown {
    const code = codes.get(path);
    if (code) {
      // Identity distinguishes equal source strings at different paths. toJSON
      // preserves the original source in whole-payload and nested-node copies.
      const marker = { toJSON: () => code.value };
      markers.set(marker, code);
      return marker;
    }
    if (depth > MAX_PAYLOAD_DEPTH) {
      return value;
    }
    if (typeof value === "string") {
      const trimmed = value.trimStart();
      if (
        value.length > 500_000 ||
        (trimmed[0] !== "{" && trimmed[0] !== "[")
      ) {
        return value;
      }
      const nestedValue = deepParseJson(value, { maxDepth: 1 });
      return nestedValue === value
        ? value
        : visit(nestedValue, depth + 1, path);
    }
    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        visit(entry, depth + 1, appendJsonPath(path, index)),
      );
    }
    if (!isRecord(value)) {
      return value;
    }
    if (customCode) {
      for (const code of readEvaluatorSourceCodes(value, path, depth)) {
        codes.set(code.path, code);
      }
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        visit(entry, depth + 1, appendJsonPath(path, key)),
      ]),
    );
  }
  return { json: visit(value, 0, ""), codes, markers };
}

function readEvaluatorSourceCodes(
  value: Record<string, unknown>,
  path: string,
  depth: number,
) {
  if (value.type !== "CODE") {
    return [];
  }

  const directCode = readEvaluatorSourceCodeFields(value, path);
  let codes = directCode ? [directCode] : [];

  if (depth + 2 <= MAX_PAYLOAD_DEPTH && Array.isArray(value.versions)) {
    for (const [index, version] of value.versions.entries()) {
      if (!isRecord(version)) {
        continue;
      }

      const versionCode = readEvaluatorSourceCodeFields(
        version,
        appendJsonPath(appendJsonPath(path, "versions"), index),
      );
      if (versionCode) {
        codes.push(versionCode);
      }
    }
  }

  return codes;
}

function readEvaluatorSourceCodeFields(
  value: Record<string, unknown>,
  path: string,
) {
  if (
    typeof value.sourceCode !== "string" ||
    (value.sourceCodeLanguage !== "PYTHON" &&
      value.sourceCodeLanguage !== "TYPESCRIPT")
  ) {
    return null;
  }

  return {
    language: value.sourceCodeLanguage === "PYTHON" ? "python" : "typescript",
    path: appendJsonPath(path, "sourceCode"),
    value: value.sourceCode,
  } satisfies PayloadCode;
}

function appendJsonPath(path: string, key: string | number) {
  if (typeof key === "number") {
    return `${path}[${key}]`;
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(key)) {
    return `${path}[${JSON.stringify(key)}]`;
  }
  return path ? `${path}.${key}` : key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
