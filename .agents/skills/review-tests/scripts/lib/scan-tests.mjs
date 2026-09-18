// Extracts test blocks and module imports from a Vitest source file without a
// TypeScript dependency, so the skill runs in a worktree that has not installed
// node_modules yet.
//
// Two passes. `maskCode` lexes once and marks which byte offsets are real code,
// so later regex matching never fires inside a string, comment, or regex
// literal. `scanTests` then finds describe/it/test call sites at code offsets,
// pairs each with its closing paren, and nests them by span containment.

const WS = /\s/;
// A `/` opens a regex only where an operand may start. After an identifier,
// number, `)`, `]`, or a template/string it is division instead.
const DIVISION_PREDECESSORS = /[\w$)\]"'`]/;

/**
 * @param {string} src
 * @returns {Uint8Array} 1 at offsets holding code, 0 inside strings/comments/regex
 */
export function maskCode(src) {
  const isCode = new Uint8Array(src.length);
  // Each frame is a lexer mode. A template literal pushes 'template'; its
  // `${` pushes 'code' back on with its own brace depth so the matching `}`
  // returns to the template body rather than closing an outer block.
  const modes = [{ kind: "code", braces: 0 }];
  let prev = "";
  let i = 0;

  const top = () => modes[modes.length - 1];

  while (i < src.length) {
    const mode = top();

    if (mode.kind === "template") {
      if (src[i] === "\\") {
        i += 2;
        continue;
      }
      if (src[i] === "`") {
        modes.pop();
        prev = "`";
        i += 1;
        continue;
      }
      if (src[i] === "$" && src[i + 1] === "{") {
        isCode[i] = 1;
        isCode[i + 1] = 1;
        modes.push({ kind: "code", braces: 0 });
        prev = "{";
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    const c = src[i];
    const d = src[i + 1];

    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    // The opening delimiter of a literal stays code so structural scanning can
    // find a test's name argument; only the contents are masked.
    if (c === '"' || c === "'") {
      isCode[i] = 1;
      i += 1;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      prev = '"';
      continue;
    }
    if (c === "`") {
      isCode[i] = 1;
      modes.push({ kind: "template" });
      i += 1;
      continue;
    }
    // A regex literal must close on its own line. JSX tags (`<Foo />`,
    // `</div>`) put a `/` exactly where an operand could start, so scan ahead
    // first and fall through to ordinary code when it does not terminate.
    if (c === "/" && !DIVISION_PREDECESSORS.test(prev)) {
      const end = regexEnd(src, i);
      if (end !== -1) {
        isCode[i] = 1;
        i = end;
        prev = '"';
        continue;
      }
    }

    if (c === "{") mode.braces += 1;
    if (c === "}") {
      if (mode.braces === 0 && modes.length > 1) {
        isCode[i] = 1;
        modes.pop();
        prev = "}";
        i += 1;
        continue;
      }
      mode.braces -= 1;
    }

    isCode[i] = 1;
    if (!WS.test(c)) prev = c;
    i += 1;
  }

  return isCode;
}

/**
 * Offset just past the regex literal (and its flags) starting at `pos`, or -1
 * when the `/` does not open one.
 */
function regexEnd(src, pos) {
  if (src[pos + 1] === ">" || src[pos + 1] === "/" || src[pos + 1] === "*")
    return -1;
  let i = pos + 1;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "\n") return -1;
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      i += 1;
      while (i < src.length && /[a-z]/.test(src[i])) i += 1;
      return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * Offset of the `(` that opens the call whose callee ends at `after`, skipping a
 * balanced type-argument list. Returns -1 when no call follows.
 */
function callParenAfter(src, isCode, after) {
  let at = nextCodeOffset(src, isCode, after);
  if (at === -1) return -1;
  if (src[at] === "<") {
    // Bounded so a stray `<` comparison cannot pair with a distant `>`.
    const limit = Math.min(src.length, at + 500);
    let depth = 0;
    for (let i = at; i < limit; i += 1) {
      if (!isCode[i]) continue;
      const c = src[i];
      // `=>` inside a function type is not a closing angle bracket.
      if (c === ">" && src[i - 1] === "=") continue;
      if (c === "<") depth += 1;
      else if (c === ">") {
        depth -= 1;
        if (depth === 0) {
          at = nextCodeOffset(src, isCode, i + 1);
          break;
        }
      }
    }
    if (depth > 0 || at === -1 || at <= after) return -1;
  }
  return src[at] === "(" ? at : -1;
}

/** Reads the string or template literal starting at `pos`. */
function readLiteral(src, pos) {
  const quote = src[pos];
  if (quote !== '"' && quote !== "'" && quote !== "`") return null;
  let i = pos + 1;
  let text = "";
  while (i < src.length && src[i] !== quote) {
    if (src[i] === "\\") {
      text += src[i + 1] === "n" ? "\n" : src[i + 1];
      i += 2;
      continue;
    }
    text += src[i];
    i += 1;
  }
  return { text, end: i + 1, template: quote === "`" };
}

/** Offset of the paren matching the `(` at `open`, or -1. */
function matchParen(src, isCode, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (!isCode[i]) continue;
    if (src[i] === "(") depth += 1;
    else if (src[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function nextCodeOffset(src, isCode, from) {
  for (let i = from; i < src.length; i += 1) {
    if (isCode[i] && !WS.test(src[i])) return i;
  }
  return -1;
}

const lineOf = (lineStarts, offset) => {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};

function lineStartsOf(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i += 1)
    if (src[i] === "\n") starts.push(i + 1);
  return starts;
}

// `it`/`test` declare a test; `describe`/`suite` only group. Chained modifiers
// (`.each`, `.only`, `.skip`, `.concurrent`, ...) are part of the same call.
// The opening paren is located separately so an explicit type argument list —
// `it.each<{ input: string }>([...])` — does not hide the call.
const CALL_RE = /(?<![.\w$])(describe|suite|it|test)((?:\s*\.\s*[A-Za-z]+)*)/g;
const GROUPING = new Set(["describe", "suite"]);
const ASSERTION_RE = /(?<![.\w$])(expect|assert|expectTypeOf)(?![\w$])/g;
const IMPORT_RE =
  /(?:import\s[^;]*?from\s*|import\s*|export\s[^;]*?from\s*|require\s*\(\s*|import\s*\(\s*)(["'`])([^"'`]+)\1/g;

/**
 * Collects the assertion expressions inside `[start, end)`, each as the text of
 * the full chained call so a reviewer sees the matcher, not just `expect`.
 */
function assertionsIn(src, isCode, start, end) {
  const out = [];
  const slice = src.slice(start, end);
  ASSERTION_RE.lastIndex = 0;
  let m;
  while ((m = ASSERTION_RE.exec(slice)) !== null) {
    const at = start + m.index;
    if (!isCode[at]) continue;
    let cursor = at + m[0].length;
    // Consume `(...)`, `.member`, and `[...]` so `expect(x).rejects.toThrow(y)`
    // is captured whole.
    for (;;) {
      const next = nextCodeOffset(src, isCode, cursor);
      if (next === -1) break;
      if (src[next] === "(") {
        const close = matchParen(src, isCode, next);
        if (close === -1 || close >= end) break;
        cursor = close + 1;
        continue;
      }
      if (src[next] === "." || src[next] === "!" || src[next] === "?") {
        cursor = next + 1;
        continue;
      }
      if (/[A-Za-z_$\d]/.test(src[next])) {
        let k = next;
        while (k < end && /[\w$]/.test(src[k])) k += 1;
        cursor = k;
        continue;
      }
      break;
    }
    out.push(src.slice(at, Math.min(cursor, end)).replace(/\s+/g, " ").trim());
    ASSERTION_RE.lastIndex = cursor - start;
  }
  return out;
}

/**
 * @param {string} src
 * @param {string} [filePath] used to build stable test ids
 * @returns {{tests: Array, groups: Array, imports: string[]}}
 */
export function scanTests(src, filePath = "") {
  const isCode = maskCode(src);
  const lineStarts = lineStartsOf(src);
  const calls = [];

  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(src)) !== null) {
    if (!isCode[m.index]) continue;
    const openParen = callParenAfter(src, isCode, m.index + m[0].length);
    if (openParen === -1) continue;
    let close = matchParen(src, isCode, openParen);
    if (close === -1) continue;

    // `it.each([...])("name %s", fn)` — the name lives in the second call.
    let nameParen = openParen;
    const modifiers = m[2].replace(/[\s.]/g, "");
    const curried = /each|for/.test(modifiers);
    if (curried) {
      const next = nextCodeOffset(src, isCode, close + 1);
      if (next !== -1 && src[next] === "(") {
        nameParen = next;
        close = matchParen(src, isCode, next);
        if (close === -1) continue;
      }
    }

    const literalAt = nextCodeOffset(src, isCode, nameParen + 1);
    const literal = literalAt === -1 ? null : readLiteral(src, literalAt);

    calls.push({
      kind: GROUPING.has(m[1]) ? "group" : "test",
      name: literal ? literal.text : "<dynamic>",
      parameterized: curried,
      start: m.index,
      end: close + 1,
      bodyStart: literal ? literal.end : nameParen + 1,
    });
  }

  calls.sort((a, b) => a.start - b.start || b.end - a.end);

  // The innermost still-open call is the parent; spans are strictly nested.
  const namePathOf = (call) => {
    const path = [];
    for (const other of calls) {
      if (other === call) break;
      if (
        other.kind === "group" &&
        other.start < call.start &&
        other.end >= call.end
      ) {
        path.push(other.name);
      }
    }
    return path;
  };

  const tests = [];
  for (const call of calls) {
    if (call.kind !== "test") continue;
    // A nested `it` inside another `it` is not a separate test.
    const insideTest = calls.some(
      (o) =>
        o !== call &&
        o.kind === "test" &&
        o.start < call.start &&
        o.end >= call.end,
    );
    if (insideTest) continue;

    const path = [...namePathOf(call), call.name];
    const name = path.join(" > ");
    tests.push({
      id: filePath ? `${filePath}::${name}` : name,
      file: filePath,
      name,
      describePath: path.slice(0, -1),
      title: call.name,
      parameterized: call.parameterized,
      line: lineOf(lineStarts, call.start),
      endLine: lineOf(lineStarts, call.end - 1),
      source: src.slice(call.start, call.end),
      assertions: assertionsIn(src, isCode, call.bodyStart, call.end),
    });
  }

  const imports = [];
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    if (!isCode[m.index]) continue;
    imports.push(m[2]);
  }

  return {
    tests,
    groups: calls.filter((c) => c.kind === "group").map((c) => c.name),
    imports: [...new Set(imports)],
  };
}
