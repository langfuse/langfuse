import { matchesGlob } from "node:path";
import { type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

const createMethods = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "upsert",
]);

const writeMethods = new Set([
  ...createMethods,
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

const globCharacters = /[*?[\]{}]/;

/** rule flags Prisma creates, or every write for fully owned models, on configured models outside the files allowed to write them */
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
              oneOf: [
                { type: "array", items: { type: "string" } },
                {
                  type: "object",
                  properties: {
                    files: { type: "array", items: { type: "string" } },
                    writes: { type: "string", enum: ["creates", "all"] },
                  },
                  required: ["files", "writes"],
                  additionalProperties: false,
                },
              ],
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
        .map(([model, writer]) => [model, normalizeWriter(writer)] as const)
        .filter(([, writer]) => !isAllowed(writer.files, context.filename)),
    );
    if (restricted.size === 0) return {};

    return {
      CallExpression(node) {
        const call = modelCall(node.callee);
        if (call === undefined) return;

        const writer = restricted.get(call.model);
        if (writer === undefined) return;
        if (!restrictedMethods(writer).has(call.method)) return;

        context.report({
          node,
          messageId: "restricted",
          data: { ...call, writers: writers(writer.files) },
        });
      },
    };
  },
});

export default rule;

/** normalizeWriter reads a model's allowed files and restricted writes from either option form */
function normalizeWriter(writer: ModelWriter): {
  files: string[];
  writes: Writes;
} {
  if (Array.isArray(writer)) return { files: writer, writes: "creates" };
  return writer;
}

/** restrictedMethods lists the Prisma methods a model's writer owns */
function restrictedMethods({ writes }: { writes: Writes }): Set<string> {
  if (writes === "all") return writeMethods;
  return createMethods;
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

/** Options maps each restricted Prisma model to the file globs allowed to create its rows, or to write them at all */
type Options = { models: Record<string, ModelWriter> };

type ModelWriter = string[] | { files: string[]; writes: Writes };

type Writes = "creates" | "all";

type ModelCall = { model: string; method: string };
