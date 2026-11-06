// Agent tasks. Each task names its prompt, the file the agent's script must
// write, and a grader comparing that file with the fixture.
import { expectedRows } from "./fixture.mjs";

const TRACES_CSV_PROMPT =
  "Write a Python script that downloads every trace from my Langfuse project from the last 7 days " +
  "and saves them to traces.csv with the columns id, name, timestamp and total_cost. " +
  "I'm on Langfuse Cloud. Read the credentials from environment variables.";

// Live mode exposes the agent to the mock's responses (headers, `_deprecation`, 410).
const LIVE_SUFFIX = " My credentials are already exported in this shell. Run the script once to check that it works.";

export const TASKS = {
  "traces-csv": {
    prompt: (mode) => (mode === "live" ? TRACES_CSV_PROMPT + LIVE_SUFFIX : TRACES_CSV_PROMPT),
    output: "traces.csv",
    grade: gradeTracesCsv,
  },
};

function gradeTracesCsv(fixture, csvText) {
  if (csvText === undefined) return { ok: false, reason: "no traces.csv" };
  const [header, ...lines] = parseCsv(csvText).filter((r) => r.length > 1 || r[0] !== "");
  const want = ["id", "name", "timestamp", "total_cost"];
  if (!header || want.some((c, i) => header[i]?.trim() !== c)) return { ok: false, reason: `header ${JSON.stringify(header)}` };
  const expected = new Map(expectedRows(fixture).map((r) => [r.id, r]));
  const seen = new Set();
  const problems = { missing: 0, extra: 0, wrongName: 0, wrongTimestamp: 0, wrongCost: 0, duplicate: 0 };
  for (const [id, name, timestamp, cost] of lines) {
    const exp = expected.get(id);
    if (!exp) {
      problems.extra++;
      continue;
    }
    if (seen.has(id)) problems.duplicate++;
    seen.add(id);
    if (name !== exp.name) problems.wrongName++;
    if (Math.abs(Date.parse(normalizeTs(timestamp)) - Date.parse(exp.timestamp)) > 1000) problems.wrongTimestamp++;
    if (Math.abs(Number(cost || 0) - exp.total_cost) > 1e-6) problems.wrongCost++;
  }
  problems.missing = [...expected.keys()].filter((id) => !seen.has(id)).length;
  const ok = Object.values(problems).every((n) => n === 0);
  return { ok, rows: lines.length, expectedRows: expected.size, ...problems };
}

function normalizeTs(ts) {
  if (!ts) return ts;
  const t = ts.trim().replace(" ", "T");
  return /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
