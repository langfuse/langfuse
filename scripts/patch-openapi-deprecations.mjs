#!/usr/bin/env node
/**
 * Projects endpoint deprecations from the Fern definitions onto the exported
 * OpenAPI specs.
 *
 * `fern export` drops `availability` entirely: the exported spec carries no
 * `deprecated: true` and no vendor extension, so the API reference renderer has
 * no way to know an endpoint is deprecated. This step reads `availability` back
 * from the Fern definitions (the source of truth) and stamps the standard
 * OpenAPI `deprecated` flag plus a notice at the top of the operation
 * description.
 *
 * Edits are spliced into the exported YAML at node offsets so that everything
 * outside the two patched fields stays byte-identical to the export, and the
 * result is verified by re-parsing and deep-comparing against the expected
 * document.
 *
 * Run after the exports (see `pnpm run api:export`); `--check` verifies the
 * committed specs are already up to date without writing.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/** Every exported spec, paired with the definitions it was exported from. */
const TARGETS = [
  {
    definition: "fern/apis/server/definition",
    spec: "web/public/generated/api/openapi.yml",
  },
  {
    definition: "fern/apis/client/definition",
    spec: "web/public/generated/api-client/openapi.yml",
  },
  {
    definition: "fern/apis/organizations/definition",
    spec: "web/public/generated/organizations-api/openapi.yml",
  },
];

/** Fold width and indent step used by `fern export`. */
const LINE_WIDTH = 80;
const INDENT_STEP = 2;

/**
 * The exported specs repeat one `security` alias per operation, which trips the
 * default alias-expansion guard. These files are our own build output, so the
 * guard has nothing to protect here.
 */
const PARSE_OPTIONS = { maxAliasCount: -1 };

const NOTICE_LABEL = "**Deprecated:**";
/** Matches a notice this script wrote, so re-runs replace instead of stacking. */
const NOTICE_PATTERN = /^\*\*Deprecated:\*\*[^\n]*(?:\n\n|$)/;

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

/**
 * `availability` accepts both the shorthand string and the object form.
 * @returns {{status: string, message: string | null} | null}
 */
function readAvailability(availability) {
  if (typeof availability === "string") {
    return { status: availability, message: null };
  }
  if (availability && typeof availability === "object") {
    return {
      status: availability.status ?? null,
      message: availability.message ?? null,
    };
  }
  return null;
}

function collectYamlFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yml"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function countAvailabilityKeys(node) {
  if (Array.isArray(node)) {
    return node.reduce((total, item) => total + countAvailabilityKeys(item), 0);
  }
  if (!node || typeof node !== "object") return 0;
  return Object.entries(node).reduce(
    (total, [key, value]) =>
      total + (key === "availability" ? 1 : countAvailabilityKeys(value)),
    0,
  );
}

/**
 * Reads every deprecated endpoint out of a Fern definition directory.
 *
 * @returns {{
 *   deprecations: Map<string, {method: string, path: string, message: string, source: string}>,
 *   skipped: Array<{file: string, count: number}>,
 * }} `skipped` counts `availability` declarations that are not on an endpoint
 *   (for example on a request property); those have no operation to stamp.
 */
export function collectDeprecations(definitionDirectory) {
  const deprecations = new Map();
  const skipped = [];

  for (const file of collectYamlFiles(definitionDirectory)) {
    const definition = YAML.parse(fs.readFileSync(file, "utf8"));
    const relativeFile = path.relative(REPO_ROOT, file);
    const endpoints = definition?.service?.endpoints ?? {};
    const basePath = definition?.service?.["base-path"] ?? "";
    let endpointAvailabilityCount = 0;

    for (const [name, endpoint] of Object.entries(endpoints)) {
      const availability = readAvailability(endpoint?.availability);
      if (!availability) continue;
      endpointAvailabilityCount += 1;
      if (availability.status !== "deprecated") continue;

      const method = String(endpoint.method).toLowerCase();
      const operationPath = `${basePath}${endpoint.path}`;
      const message = (availability.message ?? "").replace(/\s+/g, " ").trim();
      if (!message) {
        throw new Error(
          `${relativeFile}: endpoint "${name}" is deprecated without a message. Add \`availability.message\` so the API reference can explain the replacement.`,
        );
      }

      deprecations.set(`${method} ${operationPath}`, {
        method,
        path: operationPath,
        message,
        source: `${relativeFile}#${name}`,
      });
    }

    const unhandled =
      countAvailabilityKeys(definition) - endpointAvailabilityCount;
    if (unhandled > 0) skipped.push({ file: relativeFile, count: unhandled });
  }

  return { deprecations, skipped };
}

/** Block scalar styles whose exact line breaks we keep when rewriting a field. */
const BLOCK_STYLES = new Set([
  YAML.Scalar.BLOCK_FOLDED,
  YAML.Scalar.BLOCK_LITERAL,
]);

/**
 * Serializes `key: value` at the indentation the exported spec uses for
 * operation fields, so the emitted block scalar folds exactly like the export.
 *
 * Passing the field's original block style keeps the text that was already
 * there byte-identical: only the lines this script adds show up in the diff.
 */
function emitPair(key, value, column, style = null) {
  assert.equal(
    column % INDENT_STEP,
    0,
    `unexpected indentation of ${column} spaces for "${key}"`,
  );
  const depth = column / INDENT_STEP;
  const node = BLOCK_STYLES.has(style)
    ? Object.assign(new YAML.Scalar(value), { type: style })
    : value;
  let wrapped = { [key]: node };
  for (let index = 0; index < depth; index += 1) wrapped = { w: wrapped };

  const lines = YAML.stringify(wrapped, {
    lineWidth: LINE_WIDTH,
    indent: INDENT_STEP,
  }).split("\n");
  // Drop the wrapper keys, then the indent of the key line itself: the splice
  // starts at the key, which the source already indents.
  return lines.slice(depth).join("\n").slice(column);
}

function columnOf(source, offset) {
  return offset - (source.lastIndexOf("\n", offset - 1) + 1);
}

/** End offset of the line holding a pair's value, newline included. */
function pairEnd(source, pair) {
  let end = pair.value.range[1];
  if (source[end - 1] === "\n") return end;
  while (end < source.length && source[end] !== "\n") end += 1;
  return end < source.length ? end + 1 : end;
}

function findPair(operation, key) {
  return operation.items.find((item) => item.key?.value === key);
}

function stripNotice(description) {
  return typeof description === "string"
    ? description.replace(NOTICE_PATTERN, "")
    : "";
}

/**
 * Collects the splices that reconcile one operation with its Fern
 * `availability`, and the expected post-patch field values.
 */
function planOperation(source, operation, message) {
  const edits = [];
  const inserts = [];
  const firstKey = operation.items[0]?.key;
  assert.ok(firstKey, "cannot patch an operation without fields");
  const column = columnOf(source, firstKey.range[0]);
  const insertOffset = firstKey.range[0] - column;

  const deprecatedPair = findPair(operation, "deprecated");
  const expectedDeprecated = message ? true : undefined;
  if (deprecatedPair) {
    const start = deprecatedPair.key.range[0] - column;
    const end = pairEnd(source, deprecatedPair);
    if (!message) {
      edits.push({ start, end, text: "" });
    } else if (deprecatedPair.value.value !== true) {
      edits.push({
        start,
        end,
        text: `${" ".repeat(column)}${emitPair("deprecated", true, column)}`,
      });
    }
  } else if (message) {
    inserts.push(emitPair("deprecated", true, column));
  }

  const descriptionPair = findPair(operation, "description");
  const base = stripNotice(descriptionPair?.value?.value);
  const notice = `${NOTICE_LABEL} ${message}`;
  const expectedDescription = message
    ? base
      ? `${notice}\n\n${base}`
      : notice
    : base || undefined;

  if (descriptionPair) {
    const start = descriptionPair.key.range[0] - column;
    const end = pairEnd(source, descriptionPair);
    if (expectedDescription === undefined) {
      edits.push({ start, end, text: "" });
    } else if (descriptionPair.value.value !== expectedDescription) {
      // Reuse the block style only while the value still spans lines, so that
      // clearing a notice restores a single-line description as it was.
      const style = expectedDescription.includes("\n")
        ? descriptionPair.value.type
        : null;
      edits.push({
        start,
        end,
        text: `${" ".repeat(column)}${emitPair("description", expectedDescription, column, style)}`,
      });
    }
  } else if (expectedDescription !== undefined) {
    inserts.push(emitPair("description", expectedDescription, column));
  }

  if (inserts.length > 0) {
    edits.push({
      start: insertOffset,
      end: insertOffset,
      text: inserts.map((line) => `${" ".repeat(column)}${line}`).join(""),
    });
  }

  return { edits, expectedDeprecated, expectedDescription };
}

function applyEdits(source, edits) {
  return [...edits]
    .sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce(
      (text, edit) =>
        text.slice(0, edit.start) + edit.text + text.slice(edit.end),
      source,
    );
}

/**
 * Reconciles an exported spec with the deprecations read from Fern: stamps
 * matching operations and removes stamps that no longer have a Fern source.
 *
 * @returns {{text: string, stamped: string[], cleared: string[]}}
 */
export function patchSpec(source, deprecations) {
  const document = YAML.parseDocument(source);
  const paths = document.get("paths");
  assert.ok(paths, "exported spec has no `paths`");

  const expected = YAML.parse(source, PARSE_OPTIONS);
  const edits = [];
  const stamped = [];
  const cleared = [];
  const matched = new Set();

  for (const pathItem of paths.items) {
    const operationPath = pathItem.key.value;
    for (const operationItem of pathItem.value.items) {
      const method = operationItem.key.value;
      if (!HTTP_METHODS.has(method)) continue;

      const key = `${method} ${operationPath}`;
      const deprecation = deprecations.get(key);
      if (deprecation) matched.add(key);

      const plan = planOperation(
        source,
        operationItem.value,
        deprecation?.message ?? null,
      );
      if (plan.edits.length === 0) continue;

      const target = expected.paths[operationPath][method];
      for (const [field, value] of [
        ["deprecated", plan.expectedDeprecated],
        ["description", plan.expectedDescription],
      ]) {
        if (value === undefined) delete target[field];
        else target[field] = value;
      }

      edits.push(...plan.edits);
      (deprecation ? stamped : cleared).push(key);
    }
  }

  const unmatched = [...deprecations.keys()].filter((key) => !matched.has(key));
  if (unmatched.length > 0) {
    throw new Error(
      `these deprecated Fern endpoints have no operation in the exported spec:\n  ${unmatched.join("\n  ")}\nCheck the service \`base-path\` handling in this script.`,
    );
  }

  const text = applyEdits(source, edits);
  // The splices must change nothing beyond the two fields they target.
  assert.deepStrictEqual(YAML.parse(text, PARSE_OPTIONS), expected);

  return { text, stamped, cleared };
}

function run(argv) {
  const checkOnly = argv.includes("--check");
  const stale = [];

  for (const target of TARGETS) {
    const specPath = path.join(REPO_ROOT, target.spec);
    const { deprecations, skipped } = collectDeprecations(
      path.join(REPO_ROOT, target.definition),
    );
    const source = fs.readFileSync(specPath, "utf8");
    const { text, stamped, cleared } = patchSpec(source, deprecations);

    for (const entry of skipped) {
      console.warn(
        `${target.spec}: ignored ${entry.count} non-endpoint \`availability\` declaration(s) in ${entry.file} (only operations carry an OpenAPI \`deprecated\` flag)`,
      );
    }

    if (text === source) {
      console.log(
        `${target.spec}: up to date (${deprecations.size} deprecated operation(s))`,
      );
      continue;
    }

    if (checkOnly) {
      stale.push(target.spec);
      console.error(
        `${target.spec}: out of date — ${stamped.length} operation(s) to stamp, ${cleared.length} to clear`,
      );
      continue;
    }

    fs.writeFileSync(specPath, text);
    console.log(
      `${target.spec}: stamped ${stamped.length} operation(s)${cleared.length > 0 ? `, cleared ${cleared.length}` : ""}`,
    );
  }

  if (stale.length > 0) {
    console.error(
      "\nRe-run `pnpm run api:export` and commit the regenerated specs.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2));
}
