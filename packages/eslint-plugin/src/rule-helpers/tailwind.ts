/**
 * Removes Tailwind's leading or trailing important modifier markers from a
 * single utility token.
 */
export function normalizeTailwindToken(token: string): string {
  return token.replace(/^!|!$/g, "");
}

/**
 * Removes variant prefixes from a Tailwind token while preserving colons that
 * appear inside bracket expressions.
 *
 * For example, `data-[state=open]:truncate` becomes `truncate`.
 */
export function stripTailwindVariants(token: string): string {
  let depth = 0;
  let lastSeparator = -1;

  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) lastSeparator = i;
  }

  return lastSeparator === -1 ? token : token.slice(lastSeparator + 1);
}

/**
 * Iterates over the Tailwind utility tokens contained in a whitespace-separated
 * class string after normalizing important markers and stripping variants.
 */
export function* extractTailwindUtilityTokens(
  value: string,
): Generator<string> {
  for (const match of value.matchAll(/\S+/g)) {
    yield normalizeTailwindToken(stripTailwindVariants(match[0]));
  }
}

/**
 * Returns whether a whitespace-separated class string contains the requested
 * Tailwind utility after stripping variants and important markers.
 */
export function hasTailwindUtility(value: string, utility: string): boolean {
  for (const match of value.matchAll(/\S+/g)) {
    if (normalizeTailwindToken(stripTailwindVariants(match[0])) === utility) {
      return true;
    }
  }

  return false;
}
