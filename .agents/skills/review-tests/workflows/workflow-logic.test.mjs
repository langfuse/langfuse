// Exercises review.js and fix.js with mocked agent()/parallel()/pipeline() so
// the deterministic layer — which flags survive, which agents are worth
// spawning, what order edits land in — is checked without spending tokens.
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
const FIX = new URL("./fix.js", import.meta.url).pathname;

const mkEvidence = (overrides = {}) => ({
  mode: "diff",
  degraded: false,
  tests: [
    {
      id: "a.test.ts::rejects expired token",
      file: "a.test.ts",
      name: "rejects expired token",
      line: 10,
      endLine: 14,
      parameterized: false,
      source: 'it("rejects expired token", () => { expect(v(t)).toBe(false) })',
      assertions: ["expect(v(t)).toBe(false)"],
      imports: ["auth.ts"],
      candidates: [
        {
          id: "b.test.ts::token validation rejects expired",
          file: "b.test.ts",
          line: 88,
          name: "token validation rejects expired",
          source:
            'it("token validation rejects expired", () => { expect(v(t)).toBe(false) })',
          overlap: 3,
          basis: "imports",
        },
      ],
    },
  ],
  ...overrides,
});

const calls = [];
const track = (label, out) => {
  calls.push(label);
  return out;
};

// --- case 1: judge flags axiom 1, adversary finds no gap -> deletion stands ---
{
  const { result, logs } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence: mkEvidence() },
    agent: async (prompt, opts) => {
      if (opts.phase === "Judge" && opts.label.startsWith("judge:uniqueness")) {
        return track(opts.label, {
          verdict: "flag",
          axiom: "1",
          reason: "same fixture, same rejection assertion",
          confidence: "high",
          action: "delete",
          covered_by: [
            {
              id: "b.test.ts::token validation rejects expired",
              why: "same assertion",
            },
          ],
        });
      }
      if (opts.phase === "Judge") {
        return track(opts.label, {
          verdict: "pass",
          axiom: "",
          reason: "",
          confidence: "high",
          action: "comment",
          covered_by: [],
        });
      }
      if (opts.phase === "Defend")
        return track(opts.label, {
          gap_found: false,
          checked: "same input, same assertion",
        });
      throw new Error(`unexpected phase ${opts.phase}`);
    },
  });
  assert.equal(result.findings.length, 1, "one finding");
  const f = result.findings[0];
  assert.equal(f.action, "delete");
  assert.equal(f.downgraded, false);
  assert.equal(f.defence.gapFound, false);
  assert.equal(result.counts.reviewed, 1);
  assert.equal(result.counts.kept, 0, "flagged test is not counted as kept");
  assert.ok(
    calls.some((c) => c.startsWith("defend:")),
    "adversary ran",
  );
  assert.ok(
    logs.some((l) => l.includes("1 reviewed, 0 kept")),
    logs.join("|"),
  );
  console.log(
    "case 1 OK  deletion stands; counts:",
    JSON.stringify(result.counts),
  );
}

// --- case 2: adversary finds a gap -> flag downgraded to comment ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: async (prompt, opts) => {
      if (opts.phase === "Judge") {
        return {
          verdict: "flag",
          axiom: "1",
          reason: "duplicate",
          confidence: "medium",
          action: "delete",
          covered_by: [
            {
              id: "b.test.ts::token validation rejects expired",
              why: "same assertion",
            },
          ],
        };
      }
      return {
        gap_found: true,
        gap: "only this test passes a null token",
        quote: "expect(v(null))",
        covering_test: "b.test.ts::token validation rejects expired",
      };
    },
  });
  const f = result.findings[0];
  assert.equal(f.action, "comment", "a defended flag becomes a comment");
  assert.equal(f.downgraded, true);
  assert.equal(f.defence.gap, "only this test passes a null token");
  assert.equal(result.counts.kept, 1, "a defended test is kept");
  console.log(
    "case 2 OK  defended flag downgraded; counts:",
    JSON.stringify(result.counts),
  );
}

// --- case 3: axiom 1 flag with no candidates is dropped in script ---
{
  const evidence = mkEvidence();
  evidence.tests[0].candidates = [];
  const seen = [];
  const { result } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence, onlyRules: ["uniqueness"] },
    agent: async (prompt, opts) => {
      seen.push(opts.phase);
      return {
        verdict: "flag",
        axiom: "1",
        reason: "duplicate of something",
        confidence: "low",
        action: "delete",
        covered_by: [{ id: "ghost.test.ts::nope", why: "invented" }],
      };
    },
  });
  assert.deepEqual(
    result.findings,
    [],
    "unevidenced axiom 1 flag is discarded",
  );
  assert.ok(!seen.includes("Defend"), "no adversary spent on a discarded flag");
  console.log(
    "case 3 OK  unevidenced axiom-1 flag discarded, no adversary spend",
  );
}

// --- case 4: a judge citing a candidate that was not offered is discarded ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: async () => ({
      verdict: "flag",
      axiom: "1",
      reason: "duplicate",
      confidence: "high",
      action: "delete",
      covered_by: [{ id: "hallucinated.test.ts::not offered", why: "made up" }],
    }),
  });
  assert.deepEqual(
    result.findings,
    [],
    "hallucinated covering test is filtered",
  );
  console.log("case 4 OK  hallucinated covering test filtered");
}

// --- case 5: rewrite gate failure downgrades to comment; pass keeps rewrite ---
for (const [failedWhenStubbed, ambiguous, expected] of [
  [true, false, "rewrite"],
  [false, false, "comment"],
  [false, true, "suggest-only"],
]) {
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["ownership"],
    },
    agent: async (prompt, opts) => {
      if (opts.phase === "Judge") {
        return {
          verdict: "flag",
          axiom: "2",
          reason: "asserts on a spy",
          confidence: "high",
          action: "rewrite",
          covered_by: [],
        };
      }
      if (opts.phase === "Defend") return { gap_found: false, checked: "n/a" };
      assert.equal(
        opts.isolation,
        "worktree",
        "gate runs in an isolated worktree",
      );
      return {
        replacement: 'it("rewritten", () => { expect(result).toEqual(row) })',
        subject: "validateToken",
        ambiguous,
        failed_when_stubbed: failedWhenStubbed,
        evidence: "pnpm --filter worker run test a.test.ts -> 1 failed",
      };
    },
  });
  const f = result.findings[0];
  assert.equal(
    f.action,
    expected,
    `gate(${failedWhenStubbed},${ambiguous}) -> ${expected}, got ${f.action}`,
  );
  if (expected === "rewrite") assert.ok(f.replacement && f.gate.passed);
  if (expected === "comment") assert.equal(f.gate.passed, false);
  console.log(
    `case 5 OK  gate failed=${failedWhenStubbed} ambiguous=${ambiguous} -> ${f.action}`,
  );
}

// --- case 6: empty scope returns cleanly without spawning agents ---
{
  let spawned = 0;
  const { result, logs } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence: mkEvidence({ tests: [] }) },
    agent: async () => {
      spawned += 1;
      return null;
    },
  });
  assert.equal(spawned, 0, "no agents for an empty scope");
  assert.deepEqual(result.findings, []);
  assert.ok(logs.some((l) => l.includes("no changed tests")));
  console.log("case 6 OK  empty scope short-circuits");
}

// --- case 7: a dead judge agent (null) does not crash the pipeline ---
{
  const { result } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence: mkEvidence() },
    agent: async () => null,
  });
  assert.deepEqual(result.findings, []);
  console.log("case 7 OK  null agent results tolerated");
}

// --- case 8: degraded evidence reaches the judge prompt ---
{
  let prompt = "";
  await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence({
        degraded: true,
        degradedReason: "no coverage map",
      }),
      onlyRules: ["uniqueness"],
    },
    agent: async (p, opts) => {
      if (opts.phase === "Judge") prompt = p;
      return {
        verdict: "pass",
        axiom: "",
        reason: "",
        confidence: "high",
        action: "comment",
        covered_by: [],
      };
    },
  });
  assert.match(prompt, /DEGRADED/);
  assert.match(prompt, /Cap confidence at medium/);
  console.log("case 8 OK  degraded mode is stated in the judge prompt");
}

// --- fix.js: resolved thread is a veto; standing finding is applied ---
{
  const findings = [
    {
      id: "a.test.ts::t1",
      file: "a.test.ts",
      line: 10,
      endLine: 12,
      name: "t1",
      rule: "uniqueness",
      axiom: "1",
      action: "delete",
      reason: "dup",
      confidence: "high",
      coveredBy: [],
      replacement: null,
    },
    {
      id: "a.test.ts::t2",
      file: "a.test.ts",
      line: 20,
      endLine: 22,
      name: "t2",
      rule: "ownership",
      axiom: "2",
      action: "rewrite",
      reason: "spy",
      confidence: "high",
      coveredBy: [],
      replacement: 'it("t2", () => {})',
    },
    {
      id: "b.test.ts::t3",
      file: "b.test.ts",
      line: 5,
      endLine: 7,
      name: "t3",
      rule: "uniqueness",
      axiom: "1",
      action: "delete",
      reason: "dup",
      confidence: "high",
      coveredBy: [],
      replacement: null,
    },
    {
      id: "c.test.ts::t4",
      file: "c.test.ts",
      line: 1,
      endLine: 2,
      name: "t4",
      rule: "placement",
      axiom: "6",
      action: "comment",
      reason: "layer",
      confidence: "low",
      coveredBy: [],
      replacement: null,
    },
  ];
  const threads = [
    {
      findingId: "b.test.ts::t3",
      state: "resolved",
      comments: [{ author: "dev", isOwner: true, body: "keep this one" }],
    },
  ];
  const applyPrompts = [];
  const { result, logs } = await run(FIX, {
    args: { skillDir: "/skill", findings, threads, source: "pr" },
    agent: async (prompt, opts) => {
      if (opts.phase === "Interpret") {
        const vetoed = prompt.includes("thread state: resolved");
        return {
          apply: !vetoed,
          action: vetoed
            ? "skip"
            : prompt.includes("action: rewrite")
              ? "rewrite"
              : "delete",
          rationale: vetoed ? "thread resolved by owner" : "no discussion",
          replacement_override: "",
        };
      }
      applyPrompts.push(prompt);
      const ids = [...prompt.matchAll(/([a-z]\.test\.ts)/g)];
      return {
        applied: [
          { id: "a.test.ts::t1", done: true, note: "removed" },
          { id: "a.test.ts::t2", done: true, note: "replaced" },
        ],
        checks: "Tests 4 passed (4)",
        _ids: ids.length,
      };
    },
  });
  assert.equal(
    applyPrompts.length,
    1,
    "only one file had standing verdicts, so one editor",
  );
  assert.ok(
    applyPrompts[0].includes("a.test.ts"),
    "the editor targets a.test.ts",
  );
  assert.ok(
    !applyPrompts[0].includes("c.test.ts"),
    "comment-only findings never reach an editor",
  );
  // Descending line order keeps earlier edits from shifting later ones.
  const first = applyPrompts[0].indexOf("a.test.ts:20");
  const second = applyPrompts[0].indexOf("a.test.ts:10");
  assert.ok(
    first !== -1 && second !== -1 && first < second,
    "verdicts are ordered bottom-up within a file",
  );
  assert.ok(
    result.skipped.some((s) => s.id === "b.test.ts::t3"),
    "resolved thread vetoed",
  );
  assert.equal(result.counts.applied, 2);
  assert.ok(
    logs.some((l) => l.includes("1 vetoed")),
    logs.join("|"),
  );
  console.log(
    "case 9 OK  fix.js: veto honoured, one editor per file, bottom-up order; counts:",
    JSON.stringify(result.counts),
  );
}

// --- fix.js: nothing actionable ---
{
  const { result, logs } = await run(FIX, {
    args: {
      skillDir: "/skill",
      findings: [
        {
          id: "x",
          file: "x.test.ts",
          line: 1,
          endLine: 1,
          name: "x",
          rule: "placement",
          axiom: "6",
          action: "comment",
          reason: "r",
          confidence: "low",
          coveredBy: [],
          replacement: null,
        },
      ],
      threads: [],
      source: "chat",
    },
    agent: async () => {
      throw new Error("should not spawn");
    },
  });
  assert.deepEqual(result.applied, []);
  assert.ok(logs.some((l) => l.includes("nothing actionable")));
  console.log("case 10 OK  fix.js: comment-only findings spawn no agents");
}

console.log("\nall dry-run cases passed");
