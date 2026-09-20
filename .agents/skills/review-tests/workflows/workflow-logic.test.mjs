// Exercises review.js with mocked agent()/parallel()/pipeline() so the
// deterministic layer — which flags become candidates, how clusters chunk,
// which reviewer verdicts survive — is checked without spending tokens.
//
//   node .agents/skills/review-tests/workflows/workflow-logic.test.mjs
//
// The mocks below reimplement the Workflow tool's parallel()/pipeline()
// semantics: a thunk or stage that throws yields null rather than rejecting.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const parallel = async (thunks) =>
  Promise.all(
    thunks.map(async (t) => {
      try {
        return await t();
      } catch {
        return null;
      }
    }),
  );

const pipeline = async (items, ...stages) =>
  Promise.all(
    items.map(async (item, index) => {
      let value = item;
      try {
        for (const stage of stages) value = await stage(value, item, index);
        return value;
      } catch {
        return null;
      }
    }),
  );

export async function run(file, { args, agent }) {
  const src = readFileSync(file, "utf8").replace(
    /^export\s+const\s+meta\s*=/m,
    "const meta =",
  );
  const logs = [];
  const phases = [];
  const fn = new Function(
    "args",
    "agent",
    "parallel",
    "pipeline",
    "phase",
    "log",
    `return (async () => {\n${src}\n})()`,
  );
  const result = await fn(
    args,
    agent,
    parallel,
    pipeline,
    (t) => phases.push(t),
    (m) => logs.push(m),
  );
  return { result, logs, phases };
}

const REVIEW = new URL("./review.js", import.meta.url).pathname;
const SYMBOL = "web/src/features/auth/validateToken.ts#validateToken";

// One cluster: the flagged test a.test.ts:10 and its sibling survivor b.test.ts:88.
const mkEvidence = (overrides = {}) => ({
  mode: "diff",
  base: "sha",
  baseKind: "merge-base with origin/main",
  breadthThreshold: 12,
  clusters: [
    {
      ok: true,
      code: { symbol: SYMBOL, line: 3 },
      tests: [
        { file: "a.test.ts", line: 10 },
        { file: "b.test.ts", line: 88 },
      ],
    },
  ],
  unscannable: [],
  truncated: null,
  ...overrides,
});

const flag = (file, line, reason = "same input, same assertion") => ({
  flags: [{ file, line, reason }],
});
const NO_FLAGS = { flags: [] };

// A mock that answers each phase from a table and records what ran.
const scripted =
  (table, seen = []) =>
  async (prompt, opts) => {
    seen.push({
      phase: opts.phase,
      label: opts.label,
      model: opts.model,
      prompt,
    });
    const answer = table[opts.phase];
    if (answer === undefined) throw new Error(`unexpected phase ${opts.phase}`);
    return typeof answer === "function" ? answer(prompt, opts) : answer;
  };

// --- case 1: a flag the reviewer confirms becomes one delete linking the survivor ---
{
  const seen = [];
  const { result, logs } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted(
      {
        Judge: flag("a.test.ts", 10),
        Review: {
          findings: [
            {
              file: "a.test.ts",
              line: 10,
              verdict: "delete",
              comment: "same rejection assertion as the sibling",
              coveredBy: { file: "b.test.ts", line: 88 },
              fold: false,
            },
          ],
        },
      },
      seen,
    ),
  });
  assert.equal(result.findings.length, 1);
  const f = result.findings[0];
  assert.equal(f.verdict, "delete");
  assert.deepEqual(f.coveredBy, { file: "b.test.ts", line: 88 });
  assert.equal(f.fold, false);
  assert.equal(
    result.counts.reviewed,
    2,
    "both member blocks are the population",
  );
  assert.equal(result.counts.deletes, 1);
  assert.equal(result.counts.candidates, 1);
  const judgeCall = seen.find((s) => s.phase === "Judge");
  assert.equal(judgeCall.model, "claude-sonnet-4-6", "judge default model");
  assert.match(judgeCall.prompt, /a\.test\.ts:10/);
  const reviewCall = seen.find((s) => s.phase === "Review");
  assert.equal(reviewCall.model, "claude-opus-4-8", "reviewer default model");
  assert.ok(
    logs.some((l) => l.includes("1 findings")),
    logs.join("|"),
  );
  console.log(
    "case 1 OK  confirmed flag becomes a delete linking the survivor",
  );
}

// --- case 2: a flagged candidate the reviewer keeps (omits) produces no finding ---
{
  const seen = [];
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted(
      { Judge: flag("a.test.ts", 10), Review: { findings: [] } },
      seen,
    ),
  });
  assert.deepEqual(result.findings, [], "keep is silent");
  assert.equal(
    result.counts.candidates,
    1,
    "the flag still counted as reviewed",
  );
  assert.ok(
    seen.some((s) => s.phase === "Review"),
    "a chunk with a flag is reviewed",
  );
  console.log("case 2 OK  a kept (omitted) candidate yields no finding");
}

// --- case 3: a judge flag that cites a non-member block is discarded before chunking ---
{
  const seen = [];
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted({ Judge: flag("ghost.test.ts", 1) }, seen),
  });
  assert.deepEqual(result.findings, []);
  assert.equal(result.counts.candidates, 0, "the invented flag is dropped");
  assert.ok(
    !seen.some((s) => s.phase === "Review"),
    "no chunk, so no reviewer spend",
  );
  console.log("case 3 OK  a flag citing a non-member block is discarded");
}

// --- case 4: the reviewer's verdict on an invented location is dropped ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted({
      Judge: flag("a.test.ts", 10),
      Review: {
        findings: [
          {
            file: "hallucinated.test.ts",
            line: 999,
            verdict: "delete",
            comment: "made up",
            coveredBy: { file: "b.test.ts", line: 88 },
            fold: false,
          },
        ],
      },
    }),
  });
  assert.deepEqual(result.findings, [], "an out-of-chunk finding is dropped");
  console.log(
    "case 4 OK  a reviewer verdict on an invented location is dropped",
  );
}

// --- case 5: a delete with no survivor named is dropped (loses coverage) ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted({
      Judge: flag("a.test.ts", 10),
      Review: {
        findings: [
          { file: "a.test.ts", line: 10, verdict: "delete", comment: "gone" },
        ],
      },
    }),
  });
  assert.deepEqual(
    result.findings,
    [],
    "a delete without coveredBy is unusable",
  );
  console.log("case 5 OK  a delete naming no survivor is dropped");
}

// --- case 6: two clusters sharing a member block are unioned into one reviewer call ---
{
  const seen = [];
  const evidence = mkEvidence({
    clusters: [
      {
        ok: true,
        code: { symbol: "m/a.ts#alpha", line: 1 },
        tests: [
          { file: "a.test.ts", line: 10 },
          { file: "shared.test.ts", line: 5 },
        ],
      },
      {
        ok: true,
        code: { symbol: "m/b.ts#beta", line: 1 },
        tests: [
          { file: "b.test.ts", line: 20 },
          { file: "shared.test.ts", line: 5 },
        ],
      },
    ],
  });
  const { result } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence, onlyRules: ["uniqueness"] },
    agent: scripted(
      {
        // Each cluster's judge flags its own member so both participate.
        Judge: (p) =>
          p.includes("m/a.ts#alpha")
            ? flag("a.test.ts", 10)
            : flag("b.test.ts", 20),
        Review: { findings: [] },
      },
      seen,
    ),
  });
  const reviewCalls = seen.filter((s) => s.phase === "Review");
  assert.equal(reviewCalls.length, 1, "the shared block unions both clusters");
  assert.match(reviewCalls[0].prompt, /m\/a\.ts#alpha/);
  assert.match(reviewCalls[0].prompt, /m\/b\.ts#beta/);
  assert.equal(result.counts.chunks, 1);
  assert.equal(result.counts.reviewed, 3, "three distinct member blocks");
  console.log("case 6 OK  clusters sharing a member block chunk together");
}

// --- case 7: a delete-that-folds pairs with an edit on the survivor and they link ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted({
      Judge: flag("a.test.ts", 10),
      Review: {
        findings: [
          {
            file: "a.test.ts",
            line: 10,
            verdict: "delete",
            comment: "its null-token case is the only unique input",
            coveredBy: { file: "b.test.ts", line: 88 },
            fold: true,
          },
          {
            file: "b.test.ts",
            line: 88,
            verdict: "edit",
            comment: "cover expired and null together",
            suggestion: "it('rejects expired and null', () => {})",
            absorbs: [{ file: "a.test.ts", line: 10 }],
          },
        ],
      },
    }),
  });
  assert.equal(result.findings.length, 2);
  const del = result.findings.find((f) => f.verdict === "delete");
  const edit = result.findings.find((f) => f.verdict === "edit");
  assert.equal(del.fold, true);
  assert.deepEqual(del.coveredBy, { file: "b.test.ts", line: 88 });
  assert.deepEqual(
    edit.absorbs,
    [{ file: "a.test.ts", line: 10 }],
    "the edit folds in the deleted test",
  );
  assert.equal(result.counts.deletes, 1);
  assert.equal(result.counts.edits, 1);
  console.log("case 7 OK  a fold delete and its survivor edit link both ways");
}

// --- case 8: onlyRules restricts which judges run; models override the defaults ---
{
  const seen = [];
  await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["ownership"],
      models: { judge: "sonnet-x", reviewer: "opus-x" },
    },
    agent: scripted({ Judge: NO_FLAGS }, seen),
  });
  const judges = seen.filter((s) => s.phase === "Judge");
  assert.equal(judges.length, 1, "one rule, one cluster, one judge");
  assert.ok(
    judges.every((s) => s.label.startsWith("judge:ownership")),
    "only the ownership judge ran",
  );
  assert.equal(judges[0].model, "sonnet-x", "judge model override honored");
  console.log("case 8 OK  onlyRules and per-stage model overrides honored");
}

// --- case 9: only located clusters are reviewed; the rest are reported as skipped ---
{
  const seen = [];
  const evidence = mkEvidence({
    clusters: [
      {
        ok: false,
        error: "could not locate export definition to stub",
        code: { symbol: "m/x.ts#gone" },
      },
    ],
  });
  const { result, logs } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence, onlyRules: ["uniqueness"] },
    agent: scripted({}, seen),
  });
  assert.equal(seen.length, 0, "no agents for an all-unlocated evidence");
  assert.deepEqual(result.findings, []);
  assert.equal(result.counts.reviewed, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].symbol, "m/x.ts#gone");
  assert.ok(logs.some((l) => l.includes("no clusters to review")));
  console.log("case 9 OK  unlocated clusters are skipped, not reviewed");
}

// --- case 10: a null reviewer agent does not crash the run ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: async (prompt, opts) =>
      opts.phase === "Judge" ? flag("a.test.ts", 10) : null,
  });
  assert.deepEqual(result.findings, [], "a dead reviewer yields no findings");
  console.log("case 10 OK  a null reviewer is tolerated");
}

console.log("\nall dry-run cases passed");
