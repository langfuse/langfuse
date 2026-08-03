/**
 * Build-time parser for `src/styles/globals.css`, consumed by the Design
 * reference pages (Color, Typography, Layout, Charts). The pages import the
 * stylesheet as raw text (`?raw`) and derive every token from it, so they can
 * never drift from the file — there is no hand-maintained token list.
 *
 * Understands the file's conventions:
 * - `@theme static`  → font stacks + weight roles (emitted as :root vars).
 * - `@theme inline`  → Tailwind mappings, radii, text styles, spacing,
 *                      animations (NOT emitted as runtime vars).
 * - `:root` / `.dark` → the light/dark token values.
 */

export type TokenDeclaration = {
  /** Custom property name, e.g. `--background`. */
  name: string;
  /** Declared value with whitespace collapsed, e.g. `60 14% 96%`. */
  value: string;
};

export type ParsedThemeTokens = {
  /** `@theme static`: font stacks and weight roles. */
  fontTokens: TokenDeclaration[];
  /** `@theme inline`: Tailwind mappings, radii, text styles, spacing, animations. */
  inlineTokens: TokenDeclaration[];
  /** `:root`: light theme values. */
  light: TokenDeclaration[];
  /** `.dark`: dark theme values. */
  dark: TokenDeclaration[];
};

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Concatenate the balanced-brace bodies of EVERY match of `selector` (must
 * carry the `g` flag), so a second `:root { … }` (or `.dark`, `@theme …`)
 * block added later in the file still registers instead of silently dropping
 * its tokens.
 */
function extractBlocks(css: string, selector: RegExp): string {
  selector.lastIndex = 0;
  const bodies: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = selector.exec(css)) !== null) {
    const open = css.indexOf("{", match.index);
    if (open === -1) break;
    let depth = 0;
    let closed = false;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) {
          bodies.push(css.slice(open + 1, i));
          selector.lastIndex = i + 1;
          closed = true;
          break;
        }
      }
    }
    if (!closed) {
      bodies.push(css.slice(open + 1));
      break;
    }
  }
  return bodies.join("\n");
}

/** Remove nested `@keyframes … { … }` blocks (they contain no tokens). */
function stripKeyframes(content: string): string {
  let result = "";
  let i = 0;
  while (i < content.length) {
    const at = content.indexOf("@keyframes", i);
    if (at === -1) {
      result += content.slice(i);
      break;
    }
    result += content.slice(i, at);
    let depth = 0;
    let j = content.indexOf("{", at);
    if (j === -1) break;
    for (; j < content.length; j++) {
      if (content[j] === "{") depth++;
      else if (content[j] === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    i = j;
  }
  return result;
}

/**
 * Collect every `--token: value;` declaration. Comments are matched (and
 * skipped) by the same pattern so commented-out declarations never register.
 */
function parseDeclarations(content: string): TokenDeclaration[] {
  const pattern = /\/\*[\s\S]*?\*\/|(--[\w*-]+)\s*:\s*([^;]+);/g;
  const declarations: TokenDeclaration[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) {
      declarations.push({
        name: match[1],
        value: collapseWhitespace(match[2]),
      });
    }
  }
  return declarations;
}

export function parseThemeTokens(css: string): ParsedThemeTokens {
  return {
    fontTokens: parseDeclarations(extractBlocks(css, /@theme\s+static\s*\{/g)),
    inlineTokens: parseDeclarations(
      stripKeyframes(extractBlocks(css, /@theme\s+inline\s*\{/g)),
    ),
    light: parseDeclarations(extractBlocks(css, /(^|\n)\s*:root\s*\{/g)),
    dark: parseDeclarations(extractBlocks(css, /(^|\n)\s*\.dark\s*\{/g)),
  };
}

const HSL_TRIPLET = /^-?[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%$/;

/**
 * Substitute `var(--x)` references with their declared values from `map`
 * (the active theme's tokens), falling back to the var() fallback argument.
 * The fallback group allows one level of nested parens, so a declaration
 * like `var(--x, hsl(0 0% 0%))` resolves; deeper nesting passes through raw.
 */
export function resolveDeclaredValue(
  value: string,
  map: ReadonlyMap<string, string>,
  depth = 0,
): string {
  if (depth > 6) return value;
  // Whitespace inside var() survives collapseWhitespace when the source
  // declaration is multi-line (e.g. `--text-on-bright: var(\n  --surface-2\n)`
  // collapses to `var( --surface-2 )`), so the pattern tolerates it.
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g,
    (whole, name: string, fallback: string | undefined) => {
      const target = map.get(name);
      if (target !== undefined) {
        return resolveDeclaredValue(target, map, depth + 1);
      }
      return fallback ?? whole;
    },
  );
}

/**
 * Turn a (resolved) declared value into a paintable CSS color.
 * HSL triplets get wrapped (`hsl(60 14% 96%)`); complete color functions
 * (oklch, …) pass through; non-colors return undefined.
 */
export function toCssColor(resolved: string): string | undefined {
  const value = resolved.trim();
  if (HSL_TRIPLET.test(value)) return `hsl(${value})`;
  if (/^(oklch|okhsl|rgba?|hsla?|color)\(/.test(value)) return value;
  return undefined;
}
