import assert from "node:assert/strict";
import { isMap, isScalar, parse, parseDocument, Scalar } from "yaml";

import { type DeprecatedOperation } from "./fern-deprecations";

/** Fold width used by `fern export`. */
const LINE_WIDTH = 80;

/**
 * Resolving the spec to plain JS repeats one `security` alias per operation,
 * which trips the default alias-expansion guard. This file is our own build
 * output, so the guard has nothing to protect here. `parseDocument` keeps
 * aliases as nodes and needs no such option.
 */
const RESOLVE_OPTIONS = { maxAliasCount: -1 };

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

type OpenApiOperation = { deprecated?: boolean; description?: string };
type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
};

/**
 * Writes prose the way the export writes its own: a block scalar once it spans
 * lines, folded unless the field was already literal.
 */
function descriptionScalar(
  description: string,
  previous?: Scalar.Type,
): Scalar<string> | string {
  if (!description.includes("\n")) return description;

  const scalar = new Scalar(description);
  scalar.type =
    previous === Scalar.BLOCK_LITERAL
      ? Scalar.BLOCK_LITERAL
      : Scalar.BLOCK_FOLDED;
  return scalar;
}

/**
 * Writes the standard OpenAPI `deprecated` flag and a `**Deprecated:** …`
 * notice onto every operation Fern marks deprecated.
 *
 * Printing the parsed document reflows a handful of long descriptions the
 * exporter had folded differently, which is why the result is checked against
 * the expected document: formatting may move, meaning may not.
 */
export function stampDeprecations(
  source: string,
  operations: DeprecatedOperation[],
): string {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"));
  }

  const expected = parse(source, RESOLVE_OPTIONS) as OpenApiDocument;

  for (const { method, endpointPath, message } of operations) {
    const label = `${method.toUpperCase()} ${endpointPath}`;
    const operation = document.getIn(["paths", endpointPath, method], true);

    if (!isMap(operation)) {
      throw new Error(`OpenAPI schema does not contain ${label}`);
    }

    const deprecated = operation.get("deprecated");
    if (deprecated !== undefined && deprecated !== true) {
      throw new Error(`${label} has an invalid deprecated value`);
    }

    const previous = operation.get("description", true);
    const base = isScalar(previous)
      ? String(previous.value ?? "").replace(NOTICE_PATTERN, "")
      : "";
    if (base.startsWith("**Deprecated")) {
      throw new Error(
        `${label} opens its Fern docs with a hand-written deprecation notice, which would render twice; keep that text in availability.message instead`,
      );
    }

    const notice = deprecationNotice(message);
    const description = base ? `${notice}\n\n${base}` : notice;

    operation.set("deprecated", true);
    operation.set(
      "description",
      descriptionScalar(
        description,
        isScalar(previous) ? previous.type : undefined,
      ),
    );

    const target = expected.paths[endpointPath][method];
    target.deprecated = true;
    target.description = description;
  }

  const text = document.toString({ lineWidth: LINE_WIDTH });
  // Nothing may change beyond the two fields on the operations we touched.
  assert.deepStrictEqual(parse(text, RESOLVE_OPTIONS), expected);

  return text;
}
