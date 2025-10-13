const BACKSLASH = 92;
const U_CHAR = 117;
// high surrogate is the first code of a surrogate pair (\uD83D\uDE00 -> 😀)
const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;
// low surrogate is the 2nd pair.
const LOW_SURROGATE_START = 0xdc00;
const LOW_SURROGATE_END = 0xdfff;

/**
 * Decodes ONLY \uXXXX unicode escapes. Does not touch other escapes like \" \\n \\t etc.
 * Handles surrogate pairs (\uD83D\uDE00 -> 😀). Robust to truncation/invalid hex.
 * Invalid/truncated \uXXXX are left literal. Collapses paired backslashes before 'u' based on parity.
 * greedy mode decodes all \uXXXX patterns regardless of backslash escaping (e.g., \\u4F60 -> 你).
 *
 * Used to make i.e. chinese characters render from truncated JSON strings where
 * JSON.parse would fail.
 *
 * Custom (i.e. no regex) implementation for performance to only have a single pass over characters.
 * Overoptimized? yes, probably..
 * see also: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charCodeAt
 *
 * @param input - The string to decode
 * @param greedy - If true, decodes all \uXXXX patterns (ignores backslash escaping rules)
 */
export function decodeUnicodeEscapesOnly(
  input: string,
  greedy: boolean = false,
): string {
  const n = input.length;
  const out: string[] = [];
  let i = 0;
  let lastEmit = 0;

  const hex = (cc: number): number => {
    if (cc >= 48 && cc <= 57) return cc - 48; // 0-9
    if (cc >= 65 && cc <= 70) return cc - 55; // A-F
    if (cc >= 97 && cc <= 102) return cc - 87; // a-f
    return -1;
  };

  // parse 4 hex digits (abcd) at given position, return unicode or -1 if invalid
  const parseHex4 = (str: string, pos: number): number => {
    const a = hex(str.charCodeAt(pos));
    const b = hex(str.charCodeAt(pos + 1));
    const c = hex(str.charCodeAt(pos + 2));
    const d = hex(str.charCodeAt(pos + 3));
    // bit shift instead of multiplication for performance, recreating the 16bit unicode
    return (a | b | c | d) >= 0 ? (a << 12) | (b << 8) | (c << 4) | d : -1;
  };

  // Try decoding surrogate pair starting at position (after first \uXXXX)
  // Returns decoded character + bytes consumed, or null if not valid
  const tryDecodeSurrogatePair = (
    str: string,
    pos: number,
    high: number,
    maxLen: number,
  ): { decoded: string; consumed: number } | null => {
    if (high < HIGH_SURROGATE_START || high > HIGH_SURROGATE_END) return null;
    if (pos + 6 > maxLen) return null;
    if (str.charCodeAt(pos) !== BACKSLASH) return null;
    if (str.charCodeAt(pos + 1) !== U_CHAR) return null;

    const low = parseHex4(str, pos + 2);
    if (low === -1) return null;
    if (low < LOW_SURROGATE_START || low > LOW_SURROGATE_END) return null;

    const cp =
      ((high - HIGH_SURROGATE_START) << 10) +
      (low - LOW_SURROGATE_START) +
      0x10000;
    return { decoded: String.fromCodePoint(cp), consumed: 6 };
  };

  // Greedy mode: decode all \uXXXX patterns (ignores backslash parity)
  if (greedy) {
    while (i < n) {
      if (input.charCodeAt(i) !== BACKSLASH) {
        i++;
        continue;
      }

      // count backslashes before 'u'
      let j = i + 1;
      while (j < n && input.charCodeAt(j) === BACKSLASH) j++;

      // look for 'u' after backslashes
      if (j < n && input.charCodeAt(j) === U_CHAR && j + 5 <= n) {
        const codeUnit = parseHex4(input, j + 1);
        if (codeUnit !== -1) {
          // Emit everything up to the backslash run
          if (lastEmit < i) out.push(input.slice(lastEmit, i));

          // surrogate pair decoding
          const pair = tryDecodeSurrogatePair(input, j + 5, codeUnit, n);
          if (pair) {
            out.push(pair.decoded);
            i = j + 5 + pair.consumed;
            lastEmit = i;
            continue;
          }

          // regular unicode characters
          out.push(String.fromCharCode(codeUnit));
          i = j + 5;
          lastEmit = i;
          continue;
        }
      }

      // No valid \uXXXX pattern, move past the backslash(es)
      i = j;
    }

    if (lastEmit < n) out.push(input.slice(lastEmit));
    return out.join("");
  }

  // Non-greedy mode: respect backslash parity
  while (i < n) {
    // is not a '\'? continue
    if (input.charCodeAt(i) !== BACKSLASH) {
      i++;
      continue;
    }

    // count backslashes in run
    let j = i + 1;
    while (j < n && input.charCodeAt(j) === BACKSLASH) j++;
    const run = j - i;

    // only consider backslash if directly followed by 'u'
    if (j < n && input.charCodeAt(j) === U_CHAR) {
      // Emit preceding literal and collapse paired backslashes
      if (lastEmit < i) out.push(input.slice(lastEmit, i));
      const pairs = run >> 1;
      if (pairs) out.push("\\".repeat(pairs));

      if ((run & 1) === 0) {
        // Even run: the 'u' is not escaped -> leave it untouched
        i = j;
        lastEmit = i;
        continue;
      }

      // Odd run: attempt to decode \uXXXX starting at j
      if (j + 5 <= n) {
        const codeUnit = parseHex4(input, j + 1);
        if (codeUnit !== -1) {
          // Try surrogate pair decoding
          const pair = tryDecodeSurrogatePair(input, j + 5, codeUnit, n);
          if (pair) {
            out.push(pair.decoded);
            i = j + 5 + pair.consumed;
            lastEmit = i;
            continue;
          }

          // Lone high surrogate -> leave literal \uXXXX
          if (
            codeUnit >= HIGH_SURROGATE_START &&
            codeUnit <= HIGH_SURROGATE_END
          ) {
            out.push("\\u" + input.slice(j + 1, j + 5));
            i = j + 5;
            lastEmit = i;
            continue;
          }

          // Low surrogate alone? leave literal (ill-formed)
          if (
            codeUnit >= LOW_SURROGATE_START &&
            codeUnit <= LOW_SURROGATE_END
          ) {
            out.push("\\u" + input.slice(j + 1, j + 5));
            i = j + 5;
            lastEmit = i;
            continue;
          }

          // normal unicode code unit of BMP (non emoji unicode char)
          out.push(String.fromCharCode(codeUnit));
          i = j + 5;
          lastEmit = i;
          continue;
        }
      }

      // Odd run but invalid/truncated hex -> emit '\u' literally
      out.push("\\u");
      i = j + 1;
      lastEmit = i;
      continue;
    }

    // '\' not followed by 'u', don't do anything
    i = j;
  }

  if (lastEmit < n) out.push(input.slice(lastEmit));
  return out.join("");
}
