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

const SQL_TAGS = new Set(["sql", "$queryRaw", "$executeRaw"]);

// Matches template text that ends right before a LIKE pattern operand, e.g.
// `name ILIKE `, `tag LIKE '%' || `, `x NOT ILIKE ANY(`.
const LIKE_OPERAND_SUFFIX = /\bI?LIKE\s*(?:ANY\s*\(\s*)?(?:'%'\s*\|\|\s*)?$/i;

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

  // Follow a single `const` binding to its initializer.
  const variable = ASTUtils.findVariable(
    context.sourceCode.getScope(node),
    node,
  );
  const def = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (
    def?.node.type !== AST_NODE_TYPES.VariableDeclarator ||
    def.node.parent.kind !== "const" ||
    !def.node.init ||
    seen.has(def.node)
  ) {
    return false;
  }
  seen.add(def.node);
  return recurse(def.node.init);
}

function isInsensitive(object: TSESTree.ObjectExpression): boolean {
  return object.properties.some(
    (p) =>
      p.type === AST_NODE_TYPES.Property &&
      !p.computed &&
      getStaticPropertyKeyValue(p.key) === "mode" &&
      p.value.type === AST_NODE_TYPES.Literal &&
      p.value.value === "insensitive",
  );
}

function isSqlTag(tag: TSESTree.Expression): boolean {
  return SQL_TAGS.has(calleeName(tag) ?? "");
}

const rule = createRule<[], "unescaped">({
  name: "no-unescaped-like-pattern",
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
        const isInsensitiveEquals =
          key === "equals" && isInsensitive(node.parent);
        if (!isLikeKey && !isInsensitiveEquals) return;

        if (isEscaped(node.value, context)) return;

        context.report({
          node: node.value,
          messageId: "unescaped",
          data: {
            where: isInsensitiveEquals
              ? "Prisma insensitive `equals` (ILIKE)"
              : `Prisma \`${key}\``,
          },
        });
      },
      TaggedTemplateExpression(node) {
        if (!isSqlTag(node.tag)) return;
        const { quasis, expressions } = node.quasi;
        expressions.forEach((expression, i) => {
          if (!LIKE_OPERAND_SUFFIX.test(quasis[i].value.raw)) return;
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
