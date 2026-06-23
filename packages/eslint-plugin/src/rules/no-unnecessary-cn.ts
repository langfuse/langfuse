import { AST_NODE_TYPES, type TSESLint } from "@typescript-eslint/utils";
import { createRule } from "../util.js";

type Options = [{ importPath: string }];
type MessageIds = "unnecessaryCn";

const rule = createRule<Options, MessageIds>({
  name: "no-unnecessary-cn",
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow cn() calls with only one string argument.",
    },
    fixable: "code",
    schema: {
      type: "array",
      minItems: 1,
      maxItems: 1,
      items: [
        {
          type: "object",
          additionalProperties: false,
          required: ["importPath"],
          properties: {
            importPath: { type: "string", minLength: 1 },
          },
        },
      ],
    },
    messages: {
      unnecessaryCn: "Use the string directly instead of wrapping it in cn().",
    },
  },
  defaultOptions: [{ importPath: "" }],
  create(context, [{ importPath }]) {
    const cnImports = new Map<string, TSESLint.Scope.Variable>();
    const sourceCode = context.sourceCode;

    return {
      ImportDeclaration(node) {
        if (node.source.value !== importPath) return;

        for (const specifier of node.specifiers) {
          if (
            specifier.type === AST_NODE_TYPES.ImportSpecifier &&
            specifier.imported.type === AST_NODE_TYPES.Identifier &&
            specifier.imported.name === "cn"
          ) {
            const [variable] = sourceCode.getDeclaredVariables(specifier);
            cnImports.set(specifier.local.name, variable!);
          }
        }
      },
      CallExpression(node) {
        if (
          node.callee.type !== AST_NODE_TYPES.Identifier ||
          !cnImports.has(node.callee.name) ||
          node.arguments.length !== 1
        ) {
          return;
        }

        const reference = sourceCode
          .getScope(node)
          .references.find((candidate) => candidate.identifier === node.callee);
        if (reference?.resolved !== cnImports.get(node.callee.name)) {
          return;
        }

        const [argument] = node.arguments;
        if (
          argument.type !== AST_NODE_TYPES.Literal &&
          !(
            argument.type === AST_NODE_TYPES.TemplateLiteral &&
            argument.expressions.length === 0
          )
        ) {
          return;
        }

        if (argument.type === AST_NODE_TYPES.Literal) {
          if (typeof argument.value !== "string") return;
        }

        context.report({
          node,
          messageId: "unnecessaryCn",
          fix(fixer) {
            if (
              node.parent.type === AST_NODE_TYPES.JSXExpressionContainer &&
              node.parent.parent.type === AST_NODE_TYPES.JSXAttribute
            ) {
              const replacement =
                argument.type === AST_NODE_TYPES.TemplateLiteral
                  ? JSON.stringify(argument.quasis[0].value.cooked)
                  : sourceCode.getText(argument);

              return fixer.replaceText(node.parent, replacement);
            }

            return fixer.replaceText(node, sourceCode.getText(argument));
          },
        });
      },
    };
  },
});

export default rule;
