import { builtinRules } from "eslint/use-at-your-own-risk";

// ESLint's internal rule API is unsupported; keep ESLint pinned.
const noRestrictedSyntax = builtinRules.get("no-restricted-syntax");
if (!noRestrictedSyntax) {
  throw new Error("ESLint no-restricted-syntax is unavailable");
}
const noRestrictedImports = builtinRules.get("no-restricted-imports");
if (!noRestrictedImports) {
  throw new Error("ESLint no-restricted-imports is unavailable");
}

export default {
  rules: {
    "no-restricted-syntax": noRestrictedSyntax,
    "no-restricted-imports": noRestrictedImports,
  },
};
