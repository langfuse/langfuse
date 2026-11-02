import { ESLintUtils } from "@typescript-eslint/utils";

// There is no hosted documentation for our internal rules
export const createRule = ESLintUtils.RuleCreator((name) => `#${name}`);
