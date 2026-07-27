/**
 * Build-time parser for `src/styles/globals.css`, consumed by the Theme Tokens
 * Storybook gallery. The gallery imports the stylesheet as raw text (`?raw`)
 * and derives every token from it, so the gallery can never drift from the
 * file — there is no hand-maintained token list.
 *
 * Understands the file's conventions:
 * - `@theme static`  → font stacks + weight roles (emitted as :root vars).
 * - `@theme inline`  → Tailwind mappings, radii, text styles, spacing,
 *                      animations (NOT emitted as runtime vars).
 * - `:root` / `.dark` → the light/dark token values under review.
 * - `PROPOSED (review)` comments → the token(s) immediately following are
 *   flagged as proposed, and the old value is parsed from the comment's
 *   "Previous value: …" / "Previous: …" / "Previous values: a / b / c"
 *   convention.
 */

export type ProposedChange = {
  /** The comment's "Previous …" sentence, verbatim (whitespace collapsed). */
  note: string;
  /** Old value attributed to this exact token, when unambiguous. */
  previousValue?: string;
};

export type TokenDeclaration = {
  /** Custom property name, e.g. `--background`. */
  name: string;
  /** Declared value with whitespace collapsed, e.g. `60 14% 96%`. */
  value: string;
  /** Present when the declaration carries a `PROPOSED (review)` comment. */
  proposed?: ProposedChange;
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

/** Return the balanced-brace body following the first match of `selector`. */
function extractBlock(css: string, selector: RegExp): string {
  const match = selector.exec(css);
  if (!match) return "";
  const open = css.indexOf("{", match.index);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return css.slice(open + 1);
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
 * Extract the old value(s) from a `PROPOSED (review)` comment.
 * Returns the verbatim "Previous …" sentence plus the individual values
 * (split on `/` for multi-token comments).
 */
function parsePreviousValues(comment: string): {
  note: string;
  values: string[];
} {
  const previousIndex = comment.search(/Previous/);
  if (previousIndex === -1) return { note: "", values: [] };
  const note = collapseWhitespace(
    comment.slice(previousIndex).replace(/\*\/\s*$/, ""),
  );

  const colonMatch = /^Previous[^:]*:\s*([\s\S]*)$/.exec(note);
  if (!colonMatch) return { note, values: [] };

  let rest = colonMatch[1];
  // Drop trailing history notes ("…, then 60 8% 3.5% earlier in this branch").
  rest = rest.split(/,\s*then\s/)[0];
  // Drop prose parentheticals — but keep color functions (they contain "%").
  rest = rest.replace(/\((?![^)]*%)[^)]*\)/g, " ");
  // Cut at the first sentence end (a period followed by whitespace/end, so
  // decimals like `214.3` survive).
  const sentenceEnd = rest.search(/\.(?=\s|$)/);
  if (sentenceEnd !== -1) rest = rest.slice(0, sentenceEnd);

  const values = rest
    .split("/")
    .map(collapseWhitespace)
    .filter((value) => value.length > 0);
  return { note, values };
}

type ScannedItem =
  | { kind: "comment"; text: string; blankBefore: boolean }
  | { kind: "declaration"; name: string; value: string; blankBefore: boolean };

function scanItems(content: string): ScannedItem[] {
  const pattern = /\/\*[\s\S]*?\*\/|(--[\w*-]+)\s*:\s*([^;]+);/g;
  const items: ScannedItem[] = [];
  let lastEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const gap = content.slice(lastEnd, match.index);
    const blankBefore = /\n[ \t]*\n/.test(gap);
    if (match[1]) {
      items.push({
        kind: "declaration",
        name: match[1],
        value: collapseWhitespace(match[2]),
        blankBefore,
      });
    } else {
      items.push({ kind: "comment", text: match[0], blankBefore });
    }
    lastEnd = pattern.lastIndex;
  }
  return items;
}

/**
 * Attribute `PROPOSED (review)` comments to the contiguous run of
 * declarations that follows them (a run ends at a blank line or the next
 * comment):
 * - one previous value  → only the first declaration is flagged, with it;
 * - N values for N decls → mapped one-to-one in order;
 * - otherwise           → the whole run is flagged with the shared note.
 */
function parseDeclarations(content: string): TokenDeclaration[] {
  const declarations: TokenDeclaration[] = [];
  let pendingComment: string | undefined;
  let run: TokenDeclaration[] = [];

  const finalizeRun = () => {
    if (pendingComment?.includes("PROPOSED (review)") && run.length > 0) {
      const { note, values } = parsePreviousValues(pendingComment);
      if (values.length <= 1) {
        run[0].proposed = { note, previousValue: values[0] };
      } else if (values.length === run.length) {
        run.forEach((declaration, index) => {
          declaration.proposed = { note, previousValue: values[index] };
        });
      } else {
        run.forEach((declaration) => {
          declaration.proposed = { note };
        });
      }
    }
    pendingComment = undefined;
    run = [];
  };

  for (const item of scanItems(content)) {
    if (item.kind === "comment") {
      finalizeRun();
      pendingComment = item.text;
    } else {
      if (item.blankBefore) finalizeRun();
      const declaration: TokenDeclaration = {
        name: item.name,
        value: item.value,
      };
      declarations.push(declaration);
      run.push(declaration);
    }
  }
  finalizeRun();
  return declarations;
}

export function parseThemeTokens(css: string): ParsedThemeTokens {
  return {
    fontTokens: parseDeclarations(extractBlock(css, /@theme\s+static\s*\{/)),
    inlineTokens: parseDeclarations(
      stripKeyframes(extractBlock(css, /@theme\s+inline\s*\{/)),
    ),
    light: parseDeclarations(extractBlock(css, /(^|\n)\s*:root\s*\{/)),
    dark: parseDeclarations(extractBlock(css, /(^|\n)\s*\.dark\s*\{/)),
  };
}

const HSL_TRIPLET = /^-?[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%$/;

/**
 * Substitute `var(--x)` references with their declared values from `map`
 * (the active theme's tokens), falling back to the var() fallback argument.
 */
export function resolveDeclaredValue(
  value: string,
  map: ReadonlyMap<string, string>,
  depth = 0,
): string {
  if (depth > 6) return value;
  return value.replace(
    /var\((--[\w-]+)(?:,\s*([^()]*))?\)/g,
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
