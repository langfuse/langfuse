import nunjucks from "nunjucks";
import { LRUCache } from "lru-cache";
import crypto from "node:crypto";

// null loader = no filesystem access, no template inheritance
const env = new nunjucks.Environment(null as never, {
  autoescape: false,
  throwOnUndefined: false,
  trimBlocks: true,
  lstripBlocks: true,
});

const MAX_TEMPLATE_SIZE = 100_000;

const templateCache = new LRUCache<string, nunjucks.Template>({ max: 500 });

export type TemplateFormat = "default" | "jinja2";

export type CompileResult = { compiled: string; errors: string[] };

export function compilePromptTemplate(
  template: string,
  variables: Record<string, unknown>,
  format: TemplateFormat = "default",
): CompileResult {
  if (format === "default") {
    // Original mustache regex engine — backward-compatible, no conditionals/loops
    try {
      const compiled = template.replace(/{{\s*([\w.]+)\s*}}/g, (match, key) => {
        if (key in variables) {
          const value = variables[key];
          return value === undefined || value === null ? "" : String(value);
        }
        return match;
      });
      return { compiled, errors: [] };
    } catch (e) {
      return { compiled: template, errors: [String(e)] };
    }
  }

  // Jinja2 / Nunjucks path
  if (template.length > MAX_TEMPLATE_SIZE) {
    return {
      compiled: template,
      errors: [`Template exceeds ${MAX_TEMPLATE_SIZE} byte limit`],
    };
  }

  const hash = crypto.createHash("sha256").update(template).digest("hex");
  let compiled = templateCache.get(hash);

  if (!compiled) {
    try {
      compiled = nunjucks.compile(template, env);
      templateCache.set(hash, compiled);
    } catch (e) {
      return { compiled: template, errors: [String(e)] };
    }
  }

  try {
    return {
      compiled: compiled.render(variables as Record<string, unknown>),
      errors: [],
    };
  } catch (e) {
    return { compiled: template, errors: [String(e)] };
  }
}

// Nunjucks built-in globals and keywords to exclude from variable extraction
const NUNJUCKS_BUILTINS = new Set([
  "range",
  "dict",
  "joiner",
  "cycler",
  "true",
  "false",
  "null",
  "undefined",
  "loop",
  "not",
  "and",
  "or",
  "in",
  "is",
  "if",
  "else",
  "elif",
  "endif",
  "for",
  "endfor",
  "block",
  "macro",
  "call",
  "filter",
  "set",
  "include",
  "import",
  "from",
  "extends",
  "super",
  "with",
  "without",
  "context",
  "endblock",
  "endmacro",
  "endcall",
  "raw",
  "endraw",
]);

export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();
  const loopAliases = new Set<string>();

  // Extract loop aliases from {% for alias in list %} blocks
  const forRegex = /{%-?\s*for\s+(\w+)\s+in\s+(\w+)/g;
  let forMatch;
  while ((forMatch = forRegex.exec(template)) !== null) {
    loopAliases.add(forMatch[1]); // alias (e.g. "item") — exclude
    const listVar = forMatch[2];
    if (listVar && !NUNJUCKS_BUILTINS.has(listVar)) {
      variables.add(listVar); // list variable (e.g. "docs") — include
    }
  }

  // Extract {{ expr }} output expressions — take root identifier only
  const outputRegex = /{{\s*([\w]+)/g;
  let outputMatch;
  while ((outputMatch = outputRegex.exec(template)) !== null) {
    const name = outputMatch[1];
    if (name && !NUNJUCKS_BUILTINS.has(name) && !loopAliases.has(name)) {
      variables.add(name);
    }
  }

  // Extract {% if varName %} / {% elif varName %} conditions — root identifier
  const condRegex = /{%-?\s*(?:if|elif)\s+([\w]+)/g;
  let condMatch;
  while ((condMatch = condRegex.exec(template)) !== null) {
    const name = condMatch[1];
    if (name && !NUNJUCKS_BUILTINS.has(name) && !loopAliases.has(name)) {
      variables.add(name);
    }
  }

  // Also catch {% set x = var %} — include the RHS variable
  const setRegex = /{%-?\s*set\s+\w+\s*=\s*([\w]+)/g;
  let setMatch;
  while ((setMatch = setRegex.exec(template)) !== null) {
    const name = setMatch[1];
    if (name && !NUNJUCKS_BUILTINS.has(name) && !loopAliases.has(name)) {
      variables.add(name);
    }
  }

  return Array.from(variables).sort();
}
