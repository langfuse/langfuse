import { matchesGlob } from "node:path";
import { type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

const stringList = { type: "array", items: { type: "string" } } as const;

/** rule flags Prisma delegate calls and nested relation access that config routes through a service layer */
const rule = createRule<[Options], "restricted">({
  name: "no-restricted-prisma-access",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow configured Prisma model calls and nested relation access outside allowed files.",
    },
    messages: {
      restricted:
        "Direct Prisma access to {{access}} is restricted. {{message}}",
    },
    schema: [
      {
        type: "object",
        properties: {
          restrictions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                model: { type: "string" },
                methods: stringList,
                relations: stringList,
                relationKeys: stringList,
                allow: stringList,
                message: { type: "string" },
              },
              required: ["model", "message"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ restrictions: [] }],
  create(context, [{ restrictions }]) {
    const active = restrictions.filter(
      (restriction) => !isAllowed(restriction, context.filename),
    );
    if (active.length === 0) return {};

    return {
      CallExpression(node) {
        const call = modelCall(node.callee);
        if (call === undefined) return;

        const restriction = active.find((r) => restrictsCall(r, call));
        if (restriction === undefined) return;

        context.report({
          node,
          messageId: "restricted",
          data: {
            access: `${call.model}.${call.method}`,
            message: restriction.message,
          },
        });
      },
      Property(node) {
        if (node.parent.type !== "ObjectExpression") return;
        const relation = keyName(node);
        if (relation === undefined) return;

        for (const restriction of active) {
          const access = relationAccess(restriction, relation, node.value);
          if (access === undefined) continue;

          context.report({
            node,
            messageId: "restricted",
            data: { access, message: restriction.message },
          });
          return;
        }
      },
    };
  },
});

export default rule;

/** isAllowed reports whether a trailing run of the linted file's path segments matches one of the restriction's allow globs */
function isAllowed(restriction: Restriction, filename: string): boolean {
  const suffixes = pathSuffixes(filename);
  return (restriction.allow ?? []).some((glob) =>
    suffixes.some((suffix) => matchesGlob(suffix, glob)),
  );
}

/** pathSuffixes lists every trailing run of path segments, e.g. `a/b/c` → `a/b/c`, `b/c`, `c` */
function pathSuffixes(filename: string): string[] {
  const segments = filename.split(/[\\/]/);
  return segments.map((_, index) => segments.slice(index).join("/"));
}

/** modelCall reads `<client>.<model>.<method>` from a call's callee */
function modelCall(callee: TSESTree.Expression): ModelCall | undefined {
  const call = unwrapChain(callee);
  if (call.type !== "MemberExpression") return undefined;
  const method = propertyName(call);
  if (method === undefined) return undefined;

  const delegate = unwrapChain(call.object);
  if (delegate.type !== "MemberExpression") return undefined;
  const model = propertyName(delegate);
  if (model === undefined) return undefined;

  return { model, method };
}

/** restrictsCall matches a model call against a restriction; omitted methods restrict every method */
function restrictsCall(restriction: Restriction, call: ModelCall): boolean {
  if (restriction.model !== call.model) return false;
  if (restriction.methods === undefined) return true;
  return restriction.methods.includes(call.method);
}

/** relationAccess names the restricted access when a relation property's value reads or writes it */
function relationAccess(
  restriction: Restriction,
  relation: string,
  value: TSESTree.Property["value"],
): string | undefined {
  if (!(restriction.relations ?? []).includes(relation)) return undefined;

  const { relationKeys } = restriction;
  if (relationKeys === undefined) {
    if (isRelationQuery(value)) return relation;
    return undefined;
  }
  if (value.type !== "ObjectExpression") return undefined;

  const key = value.properties
    .map(keyName)
    .find((name) => name !== undefined && relationKeys.includes(name));
  if (key === undefined) return undefined;
  return `${relation}.${key}`;
}

/** isRelationQuery reports `relation: true` and `relation: { ... }` values */
function isRelationQuery(value: TSESTree.Property["value"]): boolean {
  if (value.type === "ObjectExpression") return true;
  return value.type === "Literal" && value.value === true;
}

/** unwrapChain strips optional-chain and non-null wrappers around an expression */
function unwrapChain(node: TSESTree.Expression): TSESTree.Expression {
  if (node.type === "ChainExpression") return unwrapChain(node.expression);
  if (node.type === "TSNonNullExpression") return unwrapChain(node.expression);
  return node;
}

/** propertyName reads a member's static property name for `a.b` and `a["b"]` */
function propertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return stringLiteral(node.property);
}

/** keyName reads an object property's static key for `{ a }` and `{ "a" }` */
function keyName(node: TSESTree.ObjectLiteralElement): string | undefined {
  if (node.type !== "Property") return undefined;
  if (!node.computed && node.key.type === "Identifier") return node.key.name;
  return stringLiteral(node.key);
}

/** stringLiteral returns a node's value when it is a string literal */
function stringLiteral(node: TSESTree.Node): string | undefined {
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return undefined;
}

/** Restriction routes one Prisma model, and the relations pointing at it, through its service layer */
type Restriction = {
  model: string;
  methods?: string[];
  relations?: string[];
  relationKeys?: string[];
  allow?: string[];
  message: string;
};

type Options = { restrictions: Restriction[] };

type ModelCall = { model: string; method: string };
