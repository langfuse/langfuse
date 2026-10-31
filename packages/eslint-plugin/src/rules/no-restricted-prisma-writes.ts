import { matchesGlob } from "node:path";
import { type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

const createMethods = ["create", "createMany", "createManyAndReturn", "upsert"];

const updateMethods = ["update", "updateMany", "updateManyAndReturn", "upsert"];

const deleteMethods = ["delete", "deleteMany"];

const globCharacters = /[*?[\]{}]/;

/** rule flags a configured model's restricted Prisma writes outside the files allowed to make them */
const rule = createRule<[Options], "restricted">({
  name: "no-restricted-prisma-writes",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Prisma writes on configured models outside their allowed files.",
    },
    messages: {
      restricted:
        "Do not call {{model}}.{{method}} directly; write {{model}} rows through {{writers}}.",
    },
    schema: [
      {
        type: "object",
        properties: {
          models: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: {
                files: { type: "array", items: { type: "string" } },
                create: { type: "boolean" },
                update: { type: "boolean" },
                delete: { type: "boolean" },
              },
              required: ["files"],
              anyOf: [
                { type: "object", required: ["create"] },
                { type: "object", required: ["update"] },
                { type: "object", required: ["delete"] },
              ],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ models: {} }],
  create(context, [{ models }]) {
    const restricted = new Map(
      Object.entries(models)
        .filter(([, writer]) => !isAllowed(writer.files, context.filename))
        .map(([model, writer]) => [model, restriction(writer)] as const),
    );
    if (restricted.size === 0) return {};

    return {
      CallExpression(node) {
        const call = modelCall(node.callee);
        if (call === undefined) return;

        const restriction = restricted.get(call.model);
        if (restriction === undefined) return;
        if (!restriction.methods.has(call.method)) return;

        context.report({
          node,
          messageId: "restricted",
          data: { ...call, writers: writers(restriction.files) },
        });
      },
    };
  },
});

export default rule;

/** restriction lists the Prisma methods a model's writer files own */
function restriction(writer: ModelWriter): {
  files: string[];
  methods: Set<string>;
} {
  return {
    files: writer.files,
    methods: new Set([
      ...(writer.create ? createMethods : []),
      ...(writer.update ? updateMethods : []),
      ...(writer.delete ? deleteMethods : []),
    ]),
  };
}

/** isAllowed reports whether a trailing run of the linted file's path segments matches an allow glob */
function isAllowed(allow: string[], filename: string): boolean {
  const suffixes = pathSuffixes(filename);
  return allow.some((glob) =>
    suffixes.some((suffix) => matchesGlob(suffix, glob)),
  );
}

/** pathSuffixes lists every trailing run of path segments, e.g. `a/b/c` → `a/b/c`, `b/c`, `c` */
function pathSuffixes(filename: string): string[] {
  const segments = filename.split(/[\\/]/);
  return segments.map((_, index) => segments.slice(index).join("/"));
}

/** writers names the literal allowed files for the report, leaving out wildcard exemptions like test globs */
function writers(allow: string[]): string {
  const files = allow.filter((glob) => !globCharacters.test(glob));
  if (files.length === 0) return "an allowed file";
  return files.join(" or ");
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
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return undefined;
}

/** Options maps each restricted Prisma model to the file globs allowed to make its restricted writes */
type Options = { models: Record<string, ModelWriter> };

/** ModelWriter names a model's writer files and the kinds of writes only they may make */
type ModelWriter = {
  files: string[];
  create?: boolean;
  update?: boolean;
  delete?: boolean;
};

type ModelCall = { model: string; method: string };
