import { createRule } from "../util.js";

const FORBIDDEN_TAILWIND_UTILITIES = new Set([
  "overflow-scroll",
  "overflow-x-scroll",
  "overflow-y-scroll",
]);

function* extractTailwindUtilityTokens(value: string): Generator<string> {
  for (const match of value.matchAll(/\S+/g)) {
    const normalizedToken = match[0].startsWith("!")
      ? match[0].slice(1)
      : match[0];

    yield normalizedToken;

    const variantSeparatorIndex = normalizedToken.lastIndexOf(":");
    if (variantSeparatorIndex !== -1) {
      yield normalizedToken.slice(variantSeparatorIndex + 1);
    }
  }
}

const rule = createRule({
  name: "no-tailwind-overflow-scroll",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Avoid Tailwind's forced scrollbars (`overflow-scroll`, `overflow-x-scroll`, `overflow-y-scroll`). Use `overflow-auto`, `overflow-x-auto`, `overflow-y-auto` instead to show scrollbars only when necessary.",
    },
    schema: [],
    messages: {
      unexpected:
        "Avoid Tailwind's forced scrollbars (`overflow-scroll`, `overflow-x-scroll`, `overflow-y-scroll`). Use `overflow-auto`, `overflow-x-auto`, `overflow-y-auto` instead to show scrollbars only when necessary.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // Define AST listeners here
      Literal(node) {
        if (typeof node.value === "string") {
          for (const candidateToken of extractTailwindUtilityTokens(
            node.value,
          )) {
            if (FORBIDDEN_TAILWIND_UTILITIES.has(candidateToken)) {
              context.report({ node, messageId: "unexpected" });
              break;
            }
          }
        }
      },
      TemplateElement(node) {
        if (typeof node.value.raw === "string") {
          for (const candidateToken of extractTailwindUtilityTokens(
            node.value.raw,
          )) {
            if (FORBIDDEN_TAILWIND_UTILITIES.has(candidateToken)) {
              context.report({ node, messageId: "unexpected" });
              break;
            }
          }
        }
      },
    };
  },
});

export default rule;
