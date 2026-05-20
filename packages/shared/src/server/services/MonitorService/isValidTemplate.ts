/** template.ts contains Monitor message template validation */
import Handlebars from "handlebars";

/**
 * MonitorMessageContext is the allowlisted context passed to a Monitor
 * message template at render time. Templates may only reference these
 * top-level keys.
 */
export type MonitorTemplateContext = {
  value: string;
  threshold: string;
  warningThreshold: string | null;
  operator: ">" | ">=" | "<" | "<=" | "==" | "!=";
  window: string;
  permalink: string;
  tags: string[];

  is_ok: boolean;
  is_warning: boolean;
  is_alert: boolean;
  is_no_data: boolean;

  is_fired: boolean;
  is_resolved: boolean;
  is_crossed: boolean;
};

const monitorTemplateKeys = new Set<string>([
  "value",
  "threshold",
  "warningThreshold",
  "operator",
  "window",
  "permalink",
  "tags",
  "is_ok",
  "is_warning",
  "is_alert",
  "is_no_data",
  "is_fired",
  "is_resolved",
  "is_crossed",
] satisfies (keyof MonitorTemplateContext)[]);

/**
 * isValidTemplate returns true when `source` is a Handlebars
 * template whose AST only references `MonitorMessageContext` keys and
 * does not invoke helpers, partials, decorators, or sub-expressions, and
 * does not use unescaped output (`{{{x}}}`).
 */
export const isValidTemplate = (source: string): boolean => {
  let ast: hbs.AST.Program;
  try {
    ast = Handlebars.parse(source);
  } catch {
    return false;
  }
  return ast.body.every(isAllowedStatement);
};

const isAllowedStatement = (node: hbs.AST.Statement): boolean => {
  switch (node.type) {
    case "ContentStatement":
    case "CommentStatement":
      return true;
    case "MustacheStatement": {
      const m = node as hbs.AST.MustacheStatement;
      if (m.escaped === false) return false;
      if (m.params.length > 0) return false;
      if (m.hash) return false;
      return isAllowedPath(m.path);
    }
    default:
      return false;
  }
};

const isAllowedPath = (
  path: hbs.AST.PathExpression | hbs.AST.Literal,
): boolean => {
  if (path.type !== "PathExpression") return false;
  const p = path as hbs.AST.PathExpression;
  if (p.data) return false;
  if (p.depth !== 0) return false;
  if (p.parts.length !== 1) return false;
  const head = p.parts[0];
  if (typeof head !== "string") return false;
  return monitorTemplateKeys.has(head);
};
