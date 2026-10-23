import {
  ASTUtils,
  AST_NODE_TYPES,
  type TSESLint,
  type TSESTree,
} from "@typescript-eslint/utils";
import { createRule } from "../util.js";
import { getStaticPropertyKeyValue } from "../rule-helpers/ast.js";

const ESCAPE_FUNCTION = "escapeSqlLikePattern";

// Prisma compiles these string filters to (I)LIKE on Postgres without escaping.
const PRISMA_LIKE_KEYS = new Set(["contains", "startsWith", "endsWith"]);
// With `mode: "insensitive"`, Prisma compiles these to ILIKE / NOT ILIKE too.
const PRISMA_INSENSITIVE_KEYS = new Set(["equals", "not"]);

const SQL_TAGS = new Set(["sql", "$queryRaw", "$executeRaw"]);

// Matches template text that ends right before a LIKE pattern operand, e.g.
// `name ILIKE `, `tag LIKE ('%' || `, `x NOT ILIKE ANY(`.
const LIKE_OPERAND_SUFFIX =
  /\bI?LIKE\s*(?:ANY\s*)?(?:\(\s*)?(?:'%'\s*\|\|\s*)?$/i;
// Matches template text that joins two values of the same pattern, e.g. ` || `.
const PATTERN_CONCAT = /^\s*(?:'%'\s*)?\|\|\s*(?:'%'\s*\|\|\s*)?$/;

type Context = Readonly<TSESLint.RuleContext<"unescaped", []>>;

function calleeName(callee: TSESTree.Expression): string | null {
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name;
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }
  return null;
}

function constInit(
  node: TSESTree.Identifier,
  context: Context,
): TSESTree.Expression | null {
  const variable = ASTUtils.findVariable(
    context.sourceCode.getScope(node),
    node,
  );
  const def = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (
    def?.node.type !== AST_NODE_TYPES.VariableDeclarator ||
    def.node.parent.kind !== "const" ||
    !def.node.init
  ) {
    return null;
  }
  return def.node.init;
}

function unwrap(node: TSESTree.Node): TSESTree.Node {
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    return unwrap(node.expression);
  }
  return node;
}

function isEscaped(
  node: TSESTree.Node,
  context: Context,
  seen: Set<TSESTree.Node> = new Set(),
): boolean {
  const recurse = (child: TSESTree.Node) => isEscaped(child, context, seen);

  if (node.type === AST_NODE_TYPES.Literal) return true;
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.every(recurse);
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    return node.operator === "+" && recurse(node.left) && recurse(node.right);
  }
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return recurse(node.consequent) && recurse(node.alternate);
  }
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    return recurse(node.expression);
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return calleeName(node.callee) === ESCAPE_FUNCTION;
  }
  if (node.type !== AST_NODE_TYPES.Identifier) return false;
  if (node.name === "undefined") return true;

  // Follow a single `const` binding to its initializer. `seen` holds only the
  // bindings on the current path, so it stops cycles but allows reuse.
  const init = constInit(node, context);
  if (!init || seen.has(init)) return false;
  seen.add(init);
  const escaped = recurse(init);
  seen.delete(init);
  return escaped;
}

// A `mode` that cannot be resolved to a literal other than "insensitive"
// counts as insensitive.
function isInsensitiveMode(value: TSESTree.Node, context: Context): boolean {
  const node = unwrap(value);
  if (node.type === AST_NODE_TYPES.Literal) return node.value === "insensitive";
  if (node.type === AST_NODE_TYPES.Identifier) {
    const init = constInit(node, context);
    return init ? isInsensitiveMode(init, context) : true;
  }
  return true;
}

function isInsensitive(
  object: TSESTree.ObjectExpression,
  context: Context,
): boolean {
  return object.properties.some((p) => {
    if (p.type === AST_NODE_TYPES.SpreadElement) {
      const argument = unwrap(p.argument);
      const init =
        argument.type === AST_NODE_TYPES.Identifier
          ? constInit(argument, context)
          : null;
      const spread = init && unwrap(init);
      return spread?.type === AST_NODE_TYPES.ObjectExpression
        ? isInsensitive(spread, context)
        : true;
    }
    return (
      !p.computed &&
      getStaticPropertyKeyValue(p.key) === "mode" &&
      isInsensitiveMode(p.value, context)
    );
  });
}

function isSqlTag(tag: TSESTree.Expression): boolean {
  return SQL_TAGS.has(calleeName(tag) ?? "");
}

const rule = createRule<[], "unescaped">({
  name: "no-unescaped-prisma-like-pattern",
  meta: {
    type: "problem",
    docs: {
      description: `Require ${ESCAPE_FUNCTION}() on values used as SQL LIKE patterns, so _, % and \\ match literally.`,
    },
    messages: {
      unescaped: `{{where}} treats _, % and \\ in this value as wildcards. Wrap user input in ${ESCAPE_FUNCTION}().`,
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      Property(node) {
        if (
          node.computed ||
          node.parent.type !== AST_NODE_TYPES.ObjectExpression
        )
          return;
        const key = getStaticPropertyKeyValue(node.key) ?? "";

        const isLikeKey = PRISMA_LIKE_KEYS.has(key);
        const isInsensitiveMatch =
          PRISMA_INSENSITIVE_KEYS.has(key) &&
          node.value.type !== AST_NODE_TYPES.ObjectExpression &&
          isInsensitive(node.parent, context);
        if (!isLikeKey && !isInsensitiveMatch) return;

        if (isEscaped(node.value, context)) return;

        context.report({
          node: node.value,
          messageId: "unescaped",
          data: {
            where: isInsensitiveMatch
              ? `Prisma insensitive \`${key}\` (ILIKE)`
              : `Prisma \`${key}\``,
          },
        });
      },
      TaggedTemplateExpression(node) {
        if (!isSqlTag(node.tag)) return;
        const { quasis, expressions } = node.quasi;
        let inPattern = false;
        expressions.forEach((expression, i) => {
          const before = quasis[i].value.raw;
          inPattern =
            LIKE_OPERAND_SUFFIX.test(before) ||
            (inPattern && PATTERN_CONCAT.test(before));
          if (!inPattern) return;
          if (isEscaped(expression, context)) return;
          context.report({
            node: expression,
            messageId: "unescaped",
            data: { where: "SQL LIKE" },
          });
        });
      },
    };
  },
});

export default rule;
