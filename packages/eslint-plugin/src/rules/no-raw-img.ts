import { createRule } from "../util.js";

export default createRule({
  name: "no-raw-img",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require approved image rendering instead of raw image elements.",
    },
    schema: [],
    messages: {
      unsafeImage:
        "Use the project's approved image controller so sources are checked before loading.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type === "JSXIdentifier" && node.name.name === "img") {
          context.report({ node, messageId: "unsafeImage" });
        }
      },
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        if (
          node.specifiers.length > 0 &&
          node.specifiers.every(
            (specifier) =>
              specifier.type === "ImportSpecifier" &&
              specifier.importKind === "type",
          )
        )
          return;
        if (node.source.value === "next/image") {
          context.report({ node, messageId: "unsafeImage" });
        }
      },
    };
  },
});
