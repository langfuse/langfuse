import assert from "node:assert/strict";
import {
  isMap,
  isScalar,
  isSeq,
  parse,
  parseDocument,
  type Node,
  type Pair,
} from "yaml";

/** Fold width used by `fern export`. */
const LINE_WIDTH = 80;
const RESOLVE_OPTIONS = { maxAliasCount: -1 };
const UNION_KEYS = ["oneOf", "anyOf"] as const;

function scalarString(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined;
  const value = node.value;
  return typeof value === "string" ? value : undefined;
}

function pairKey(pair: Pair): string | undefined {
  return scalarString(pair.key);
}

function refName(node: Node | null | undefined): string | undefined {
  if (!isMap(node)) return undefined;
  const ref = scalarString(node.get("$ref", true));
  return ref?.split("/").at(-1) ?? ref;
}

/** References that compose the variant itself, excluding refs in properties. */
function composingRefNames(variant: Node): string[] {
  if (!isMap(variant)) return [];

  const direct = refName(variant);
  if (direct) return [direct];

  const allOf = variant.get("allOf", true);
  if (!isSeq(allOf)) return [];

  return allOf.items
    .map((item) => refName(item as Node))
    .filter((name): name is string => Boolean(name));
}

function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}

function inferVariantName(
  variant: Node,
  schemas: Node | null | undefined,
): string | undefined {
  if (!isMap(variant)) return undefined;

  const title = scalarString(variant.get("title", true));
  if (title) return pascalCase(title);

  const uniqueRefs = [...new Set(composingRefNames(variant))];
  if (uniqueRefs.length > 1) return undefined;

  const refName = uniqueRefs[0];
  if (refName) {
    const referencedSchema = isMap(schemas)
      ? schemas.get(refName, true)
      : undefined;
    if (isMap(referencedSchema)) {
      const referencedTitle = scalarString(referencedSchema.get("title", true));
      if (referencedTitle) return pascalCase(referencedTitle);
    }
    return refName;
  }

  const type = scalarString(variant.get("type", true));
  if (!type) return undefined;

  const format = scalarString(variant.get("format", true));
  return pascalCase(format ? `${format}-${type}` : type);
}

function stampNode(
  node: Node | null | undefined,
  path: string,
  schemas: Node | null | undefined,
): number {
  let stamped = 0;

  if (isMap(node)) {
    for (const unionKey of UNION_KEYS) {
      const union = node.get(unionKey, true);
      if (!isSeq(union)) continue;

      const names = union.items.map((variant, index) => {
        const name = inferVariantName(variant as Node, schemas);
        if (!name) {
          throw new Error(
            `Cannot infer OpenAPI variant title for ${path}.${unionKey}[${index}]`,
          );
        }
        return name;
      });

      const duplicate = names.find(
        (name, index) => names.indexOf(name) !== index,
      );
      if (duplicate) {
        throw new Error(
          `Duplicate OpenAPI variant title ${duplicate} in ${path}.${unionKey}`,
        );
      }

      union.items.forEach((variant, index) => {
        if (!isMap(variant)) {
          throw new Error(
            `Cannot stamp non-object union variant ${path}.${unionKey}[${index}]`,
          );
        }
        const hasNaturalName =
          scalarString(variant.get("title", true)) || refName(variant);
        if (!hasNaturalName) {
          variant.set("title", names[index]);
          stamped += 1;
        }
      });
    }

    for (const pair of node.items) {
      const key = pairKey(pair) ?? "?";
      stamped += stampNode(pair.value as Node, `${path}.${key}`, schemas);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, index) => {
      stamped += stampNode(item as Node, `${path}[${index}]`, schemas);
    });
  }

  return stamped;
}

/**
 * Gives every OpenAPI `oneOf` / `anyOf` branch a stable display title.
 *
 * Fern emits anonymous wrapper objects for discriminated unions. Scalar then
 * falls back to the parent schema title, making every option look identical in
 * the API reference. Name anonymous wrappers from their composing schema and
 * anonymous primitives from their format/type. Direct refs and existing titles
 * already have a stable name and stay untouched.
 */
export function stampUnionVariantTitles(source: string): {
  source: string;
  stamped: number;
} {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"));
  }

  const schemas = document.getIn(["components", "schemas"], true) as
    | Node
    | null
    | undefined;
  const stamped = stampNode(document.contents, "$", schemas);
  const expected = document.toJS(RESOLVE_OPTIONS) as unknown;
  const text = document.toString({ lineWidth: LINE_WIDTH });
  const after = parse(text, RESOLVE_OPTIONS) as unknown;

  assert.deepStrictEqual(after, expected);

  return { source: text, stamped };
}
