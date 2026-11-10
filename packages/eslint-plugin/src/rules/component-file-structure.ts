import { basename, extname } from "node:path";
import { AST_NODE_TYPES as N, type TSESTree } from "@typescript-eslint/utils";
import {
  isComponentWrapperCall,
  visitFunctionReturnExpressions,
} from "../react-components.js";
import { createRule } from "../util.js";

export default createRule({
  name: "component-file-structure",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a single PascalCase component export matching its filename.",
    },
    messages: {
      multiple:
        "Only one React component may be exported per file. Move additional exported components into their own files, make them private, or attach them as composite subcomponents.",
      filename:
        'Filename does not match component name "{{ name }}". Rename the file to "{{ name }}" while keeping its extension.',
      pascalCase:
        'Component "{{ name }}" is not PascalCase. Rename it to PascalCase and update its references.',
      anonymous:
        "The exported React component is anonymous. Give it a PascalCase name using a named declaration or assign it to a PascalCase variable before exporting it.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const exports: {
      name: string | undefined;
      value: TSESTree.Node;
      node: TSESTree.Node;
    }[] = [];

    function getDefinition(node: TSESTree.Identifier) {
      let scope: ReturnType<typeof context.sourceCode.getScope> | null =
        context.sourceCode.getScope(node);
      while (scope && !scope.set.has(node.name)) scope = scope.upper;
      return scope?.set.get(node.name)?.defs[0];
    }

    function isObjectAssignCall(node: TSESTree.CallExpression) {
      const callee = node.callee;
      return (
        callee.type === N.MemberExpression &&
        callee.object.type === N.Identifier &&
        callee.object.name === "Object" &&
        !callee.computed &&
        callee.property.type === N.Identifier &&
        callee.property.name === "assign"
      );
    }

    function renders(
      value: TSESTree.Expression,
      name: string,
      seen: Set<TSESTree.Node>,
    ): boolean {
      if (seen.has(value)) return false;
      seen.add(value);
      if (value.type === N.Identifier) {
        const definition = getDefinition(value);
        if (definition?.type !== "Variable") return false;
        const declaration = definition.node;
        return declaration.init ? renders(declaration.init, name, seen) : false;
      }
      if (value.type === N.JSXElement || value.type === N.JSXFragment)
        return true;
      if (value.type === N.ConditionalExpression)
        return (
          renders(value.consequent, name, seen) ||
          renders(value.alternate, name, seen)
        );
      if (value.type === N.LogicalExpression)
        return (
          renders(value.left, name, seen) || renders(value.right, name, seen)
        );
      if (
        value.type === N.TSAsExpression ||
        value.type === N.TSSatisfiesExpression
      )
        return renders(value.expression, name, seen);
      return (
        value.type === N.Literal && value.value === null && /^[A-Z]/.test(name)
      );
    }

    function isComponent(
      node: TSESTree.Node,
      name: string,
      seen: Set<TSESTree.Node>,
    ): boolean {
      if (seen.has(node)) return false;
      seen.add(node);
      if (node.type === N.Identifier) {
        const definition = getDefinition(node);
        if (!definition) return false;
        if (
          definition.type !== "Variable" &&
          definition.type !== "FunctionName" &&
          definition.type !== "ClassName"
        )
          return false;
        return isComponent(definition.node, name, seen);
      }
      if (node.type === N.VariableDeclarator) {
        if (
          node.id.type === N.Identifier &&
          node.id.typeAnnotation &&
          /\b(?:FC|FunctionComponent|ComponentType)\b/.test(
            context.sourceCode.getText(node.id.typeAnnotation),
          )
        )
          return true;
        return node.init ? isComponent(node.init, name, seen) : false;
      }
      if (
        node.type === N.TSAsExpression ||
        node.type === N.TSSatisfiesExpression ||
        node.type === N.TSNonNullExpression
      )
        return isComponent(node.expression, name, seen);
      if (node.type === N.CallExpression) {
        if (isComponentWrapperCall(node)) return true;
        if (isObjectAssignCall(node)) {
          const root = node.arguments[0];
          return root ? isComponent(root, name, seen) : false;
        }
        return false;
      }
      if (node.type === N.ClassDeclaration || node.type === N.ClassExpression) {
        const base = node.superClass;
        return (
          !!base &&
          ((base.type === N.Identifier &&
            /^(Pure)?Component$/.test(base.name)) ||
            (base.type === N.MemberExpression &&
              base.property.type === N.Identifier &&
              /^(Pure)?Component$/.test(base.property.name)))
        );
      }
      if (
        node.type !== N.FunctionDeclaration &&
        node.type !== N.FunctionExpression &&
        node.type !== N.ArrowFunctionExpression
      )
        return false;
      const props = node.params[0];
      if (props?.type === N.Identifier) {
        const annotation = props.typeAnnotation?.typeAnnotation;
        // React supplies a props object, not a primitive callback argument.
        if (
          annotation?.type === N.TSStringKeyword ||
          annotation?.type === N.TSNumberKeyword ||
          annotation?.type === N.TSBooleanKeyword
        )
          return false;
      }
      // Nested function returns belong to factories' components, not the factory.
      let hasRender = false;
      visitFunctionReturnExpressions(node, (value) => {
        hasRender ||= renders(value, name, new Set());
      });
      return hasRender;
    }

    return {
      ExportNamedDeclaration(node) {
        if (node.exportKind === "type" || node.source) return;
        const declaration = node.declaration;
        if (declaration?.type === N.VariableDeclaration) {
          for (const value of declaration.declarations) {
            if (value.id.type === N.Identifier)
              exports.push({ name: value.id.name, value, node: value });
          }
        } else if (
          declaration &&
          (declaration.type === N.FunctionDeclaration ||
            declaration.type === N.ClassDeclaration) &&
          declaration.id
        ) {
          exports.push({ name: declaration.id.name, value: declaration, node });
        }
        for (const specifier of node.specifiers) {
          if (specifier.exportKind === "type") continue;
          const name =
            specifier.exported.type === N.Identifier
              ? specifier.exported.name
              : specifier.exported.value;
          exports.push({
            name: name === "default" ? specifier.local.name : name,
            value: specifier.local,
            node: specifier,
          });
        }
      },
      ExportDefaultDeclaration(node) {
        const value = node.declaration;
        const name = (() => {
          let current: TSESTree.Node = value;
          while (
            current.type === N.CallExpression &&
            (isComponentWrapperCall(current) || isObjectAssignCall(current)) &&
            current.arguments[0]
          ) {
            current = current.arguments[0];
          }
          if (current.type === N.Identifier) return current.name;
          if (
            current.type === N.FunctionDeclaration ||
            current.type === N.FunctionExpression ||
            current.type === N.ClassDeclaration ||
            current.type === N.ClassExpression
          )
            return current.id?.name;
          return undefined;
        })();
        exports.push({ name, value, node });
      },
      "Program:exit"() {
        let component: (typeof exports)[number] | undefined;
        const counted = new Set<TSESTree.Node>();
        for (const exported of exports) {
          const declaration =
            exported.value.type === N.Identifier
              ? (getDefinition(exported.value)?.node ?? exported.value)
              : exported.value;
          if (!isComponent(exported.value, exported.name ?? "", new Set()))
            continue;
          if (exported.name && !/^[A-Z][a-zA-Z0-9]*$/.test(exported.name)) {
            context.report({
              node: exported.node,
              messageId: "pascalCase",
              data: { name: exported.name },
            });
          }
          if (counted.has(declaration)) continue;
          counted.add(declaration);
          if (component) {
            context.report({ node: exported.node, messageId: "multiple" });
            return;
          }
          component = exported;
        }
        if (!component) return;
        if (!component.name) {
          context.report({ node: component.node, messageId: "anonymous" });
          return;
        }
        const filename = basename(context.filename);
        if (basename(filename, extname(filename)) !== component.name)
          context.report({
            node: component.node,
            messageId: "filename",
            data: { name: component.name },
          });
      },
    };
  },
});
