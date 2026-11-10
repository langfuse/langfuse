import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createComponentReturnExpressionVisitors } from "../react-components.js";
import { createRule } from "../util.js";

const rule = createRule({
  name: "no-let-assign-in-react",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow render-time reassignment of let variables in React components.",
    },
    schema: [],
    messages: {
      unexpectedReassignment:
        "Do not reassign let variable '{{name}}' during render. Compute the value with useMemo and assign it to a const instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    const components = new Set<
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
    >();

    return {
      ...createComponentReturnExpressionVisitors({
        onComponentFunction(node) {
          components.add(node);
        },
      }),
      "Program:exit"() {
        for (const component of components) {
          const functionScope = context.sourceCode.getScope(component.body);
          const scopes = [functionScope];
          for (const scope of scopes) {
            scopes.push(
              ...scope.childScopes.filter(
                (child) => child.variableScope === functionScope,
              ),
            );
            for (const variable of scope.variables) {
              const isLet = variable.defs.some(
                (definition) =>
                  definition.type === "Variable" &&
                  definition.parent?.type ===
                    AST_NODE_TYPES.VariableDeclaration &&
                  definition.parent.kind === "let",
              );
              if (!isLet) continue;
              const counterLoop = variable.defs
                .map((definition) => definition.parent?.parent)
                .find(
                  (node) =>
                    node?.type === AST_NODE_TYPES.ForStatement &&
                    variable.defs.some(
                      (definition) => definition.parent === node.init,
                    ),
                );
              for (const reference of variable.references) {
                if (!reference.isWrite() || reference.init) continue;
                if (reference.from.variableScope !== functionScope) continue;
                if (
                  counterLoop?.type === AST_NODE_TYPES.ForStatement &&
                  counterLoop.update &&
                  reference.identifier.range[0] >=
                    counterLoop.update.range[0] &&
                  reference.identifier.range[1] <= counterLoop.update.range[1]
                ) {
                  continue;
                }
                context.report({
                  node: reference.identifier,
                  messageId: "unexpectedReassignment",
                  data: { name: variable.name },
                });
              }
            }
          }
        }
      },
    };
  },
});

export default rule;
