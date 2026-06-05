const FORBIDDEN_TAILWIND_UTILITIES = new Set([
  "overflow-scroll",
  "overflow-x-scroll",
  "overflow-y-scroll",
]);

const message =
  "Avoid Tailwind's forced scrollbars (`overflow-scroll`, `overflow-x-scroll`, `overflow-y-scroll`). Use `overflow-auto`, `overflow-x-auto`, `overflow-y-auto` instead to show scrollbars only when necessary.";

function normalizeTailwindToken(token) {
  return token.replace(/^!|!$/g, "");
}

function* extractTailwindUtilityTokens(value) {
  for (const match of value.matchAll(/\S+/g)) {
    const normalizedToken = normalizeTailwindToken(match[0]);
    const variantSeparatorIndex = normalizedToken.lastIndexOf(":");
    yield variantSeparatorIndex === -1
      ? normalizedToken
      : normalizeTailwindToken(
          normalizedToken.slice(variantSeparatorIndex + 1),
        );
  }
}

function hasForbiddenTailwindUtility(value) {
  for (const candidateToken of extractTailwindUtilityTokens(value)) {
    if (FORBIDDEN_TAILWIND_UTILITIES.has(candidateToken)) {
      return true;
    }
  }
  return false;
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: message,
    },
    messages: {
      unexpected: message,
    },
    schema: [],
  },
  create(context) {
    return {
      Literal(node) {
        if (
          typeof node.value === "string" &&
          hasForbiddenTailwindUtility(node.value)
        ) {
          context.report({ node, messageId: "unexpected" });
        }
      },
      TemplateElement(node) {
        if (
          typeof node.value?.raw === "string" &&
          hasForbiddenTailwindUtility(node.value.raw)
        ) {
          context.report({ node, messageId: "unexpected" });
        }
      },
    };
  },
};

export default rule;
