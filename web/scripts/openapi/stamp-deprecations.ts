import assert from "node:assert/strict";
import {
  isMap,
  isScalar,
  parse,
  parseDocument,
  Scalar,
  stringify,
  type YAMLMap,
} from "yaml";

import { type DeprecatedOperation } from "./fern-deprecations";

/** Fold width and indent step used by `fern export`. */
const LINE_WIDTH = 80;
const INDENT_STEP = 2;

/**
 * The exported spec repeats one `security` alias per operation, which trips the
 * default alias-expansion guard. This file is our own build output, so the
 * guard has nothing to protect here.
 */
const PARSE_OPTIONS = { maxAliasCount: -1 };

const NOTICE_LABEL = "**Deprecated:**";
/** Matches a notice this script wrote, so re-runs replace instead of stacking. */
const NOTICE_PATTERN = /^\*\*Deprecated:\*\*[^\n]*(?:\n\n|$)/;

/**
 * Every deprecation in the definitions retires a Langfuse v3 endpoint, so the
 * notice can point at the upgrade guide without each message repeating the link.
 */
const UPGRADE_GUIDE_URL =
  "https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4";

/** The notice put in front of a deprecated operation's description. */
export function deprecationNotice(message: string): string {
  return `${NOTICE_LABEL} ${message} See the [Langfuse v3 to v4 upgrade guide](${UPGRADE_GUIDE_URL}).`;
}

/** Block scalar styles whose exact line breaks we keep when rewriting a field. */
const BLOCK_STYLES: ReadonlySet<unknown> = new Set([
  Scalar.BLOCK_FOLDED,
  Scalar.BLOCK_LITERAL,
]);

type OpenApiOperation = { deprecated?: boolean; description?: string };
type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
};

type Edit = { start: number; end: number; text: string };
type ScalarPair = { key: Scalar; value: Scalar };

function rangeOf(node: Scalar | YAMLMap): [number, number, number] {
  if (!node.range)
    throw new Error("Cannot locate a node in the OpenAPI source");
  return node.range;
}

/**
 * Serializes `key: value` at the indentation the exported spec uses for
 * operation fields, so the emitted block scalar folds exactly like the export.
 *
 * Passing the field's original block style keeps the text that was already
 * there byte-identical: only the lines this script adds show up in the diff.
 */
function emitPair(
  key: string,
  value: string,
  column: number,
  style?: Scalar.Type,
): string {
  let node: Scalar<string> | string = value;
  if (style) {
    const scalar = new Scalar(value);
    scalar.type = style;
    node = scalar;
  }

  // Serialized at column 0 against the width that is left, then indented back
  // in: the splice starts at the key, which the source already indents, and
  // blank lines stay blank the way the export writes them.
  const lines = stringify(
    { [key]: node },
    { lineWidth: LINE_WIDTH - column, indent: INDENT_STEP },
  )
    .trimEnd()
    .split("\n");
  const indent = " ".repeat(column);

  return `${lines
    .map((line, index) => (index === 0 || !line ? line : `${indent}${line}`))
    .join("\n")}\n`;
}

function columnOf(source: string, offset: number): number {
  return offset - (source.lastIndexOf("\n", offset - 1) + 1);
}

/** End offset of the line holding a pair's value, newline included. */
function pairEnd(source: string, value: Scalar): number {
  let end = rangeOf(value)[1];
  if (source[end - 1] === "\n") return end;
  while (end < source.length && source[end] !== "\n") end += 1;
  return end < source.length ? end + 1 : end;
}

function findScalarPair(
  operation: YAMLMap,
  name: string,
): ScalarPair | undefined {
  for (const item of operation.items) {
    if (!isScalar(item.key) || item.key.value !== name) continue;
    if (!isScalar(item.value)) {
      throw new Error(`Expected "${name}" to hold a scalar value`);
    }
    return { key: item.key, value: item.value };
  }
  return undefined;
}

function firstKeyOf(operation: YAMLMap): Scalar {
  const key = operation.items[0]?.key;
  if (!isScalar(key)) throw new Error("Cannot patch an operation without keys");
  return key;
}

/**
 * A value that now spans lines has to become a block scalar: keep the style the
 * export chose for the field, and otherwise fold the way it folds its own prose.
 */
function blockStyleFor(
  description: string,
  previous?: Scalar.Type,
): Scalar.Type | undefined {
  if (!description.includes("\n")) return undefined;
  return previous && BLOCK_STYLES.has(previous)
    ? previous
    : Scalar.BLOCK_FOLDED;
}

function stripNotice(description: unknown): string {
  return typeof description === "string"
    ? description.replace(NOTICE_PATTERN, "")
    : "";
}

/** Appends `deprecated: true` unless the operation already carries it. */
function planDeprecatedFlag(
  source: string,
  operation: YAMLMap,
  label: string,
): Edit | undefined {
  const deprecated = operation.get("deprecated");
  if (deprecated === true) return undefined;
  if (deprecated !== undefined) {
    throw new Error(`${label} has an invalid deprecated value`);
  }

  const range = rangeOf(operation);
  const column = columnOf(source, range[0]);
  // Insert on its own line directly after the operation's last line.
  const offset = source.lastIndexOf("\n", range[1] - 1) + 1;

  return {
    start: offset,
    end: offset,
    text: `${" ".repeat(column)}deprecated: true\n`,
  };
}

/**
 * Prepends the deprecation notice to the operation description, replacing a
 * notice from an earlier run rather than stacking a second one.
 */
function planNotice(
  source: string,
  operation: YAMLMap,
  message: string,
  label: string,
): { description: string; edit?: Edit } {
  const column = columnOf(source, rangeOf(firstKeyOf(operation))[0]);
  const pair = findScalarPair(operation, "description");
  const base = stripNotice(pair?.value.value);
  if (base.startsWith("**Deprecated")) {
    throw new Error(
      `${label} opens its Fern docs with a hand-written deprecation notice, which would render twice; keep that text in availability.message instead`,
    );
  }

  const notice = deprecationNotice(message);
  const description = base ? `${notice}\n\n${base}` : notice;

  if (!pair) {
    const offset = rangeOf(firstKeyOf(operation))[0] - column;
    return {
      description,
      edit: {
        start: offset,
        end: offset,
        text: `${" ".repeat(column)}${emitPair("description", description, column)}`,
      },
    };
  }

  if (pair.value.value === description) return { description };

  const style = blockStyleFor(description, pair.value.type);
  return {
    description,
    edit: {
      start: rangeOf(pair.key)[0] - column,
      end: pairEnd(source, pair.value),
      text: `${" ".repeat(column)}${emitPair("description", description, column, style)}`,
    },
  };
}

function applyEdits(source: string, edits: Edit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start || right.end - left.end)
    .reduce(
      (text, edit) =>
        `${text.slice(0, edit.start)}${edit.text}${text.slice(edit.end)}`,
      source,
    );
}

/**
 * Writes the standard OpenAPI `deprecated` flag and a `**Deprecated:** …`
 * notice onto every operation Fern marks deprecated.
 *
 * Edits are spliced at node offsets so everything outside those two fields
 * stays byte-identical to the export, and the result is verified by re-parsing
 * and comparing against the expected document.
 */
export function stampDeprecations(
  source: string,
  operations: DeprecatedOperation[],
): string {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"));
  }

  const expected = parse(source, PARSE_OPTIONS) as OpenApiDocument;
  const edits: Edit[] = [];

  for (const { method, endpointPath, message } of operations) {
    const label = `${method.toUpperCase()} ${endpointPath}`;
    const operation = document.getIn(["paths", endpointPath, method], true);

    if (!isMap(operation)) {
      throw new Error(`OpenAPI schema does not contain ${label}`);
    }

    const flag = planDeprecatedFlag(source, operation, label);
    const notice = planNotice(source, operation, message, label);

    if (flag) edits.push(flag);
    if (notice.edit) edits.push(notice.edit);

    const target = expected.paths[endpointPath][method];
    target.deprecated = true;
    target.description = notice.description;
  }

  const text = applyEdits(source, edits);
  // The splices must not change anything beyond the two fields they target.
  assert.deepStrictEqual(parse(text, PARSE_OPTIONS), expected);

  return text;
}
