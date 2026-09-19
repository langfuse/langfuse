// Exercises review.js with mocked agent()/parallel()/pipeline() so the
// deterministic layer — which flags survive, which agents are worth spawning,
// when the run aborts — is checked without spending tokens.
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

const COVERING_ID = "b.test.ts::token validation rejects expired";
const SYMBOL = "web/src/features/auth/validateToken.ts#validateToken";

const mkEvidence = (overrides = {}) => ({
  mode: "diff",
  candidateBasis: "production functions each test calls",
  tests: [
    {
      id: "a.test.ts::rejects expired token",
      file: "a.test.ts",
      name: "rejects expired token",
      line: 10,
      endLine: 14,
      parameterized: false,
      layer: "server-db",
      touchesServices: true,
      runCommand: "pnpm --filter web run test a.test.ts",
      source: 'it("rejects expired token", () => { expect(v(t)).toBe(false) })',
      assertions: ["expect(v(t)).toBe(false)"],
      symbols: [SYMBOL],
      imports: ["web/src/features/auth/validateToken.ts"],
      candidates: [
        {
          id: COVERING_ID,
          file: "b.test.ts",
          line: 88,
          name: "token validation rejects expired",
          source:
            'it("token validation rejects expired", () => { expect(v(t)).toBe(false) })',
          overlap: 1.2,
          basis: "symbols",
          sharedSymbols: [SYMBOL],
          layer: "server-db",
          runCommand: "pnpm --filter web run test b.test.ts",
        },
      ],
    },
  ],
  ...overrides,
});

const PASS = {
  verdict: "pass",
  axiom: "",
  reason: "",
  confidence: "high",
  action: "comment",
  covered_by: [],
};
const AXIOM1_FLAG = {
  verdict: "flag",
  axiom: "1",
  reason: "same fixture, same rejection assertion",
  confidence: "high",
  action: "delete",
  covered_by: [{ id: COVERING_ID, why: "same assertion" }],
};
const CONFIRMED = {
  ran: true,
  stubbed: SYMBOL,
  target_failed: true,
  covering: [{ id: COVERING_ID, failed: true }],
  evidence:
    "pnpm --filter web run test a.test.ts -> 1 failed; b.test.ts -> 1 failed",
};
const NO_GAP = { gap_found: false, checked: "same input, same assertion" };

// A mock that answers each phase from a table and records what ran.
const scripted =
  (table, seen = []) =>
  async (prompt, opts) => {
    seen.push({
      phase: opts.phase,
      label: opts.label,
      isolation: opts.isolation,
      prompt,
    });
    const answer = table[opts.phase];
    if (answer === undefined) throw new Error(`unexpected phase ${opts.phase}`);
    return typeof answer === "function" ? answer(prompt, opts) : answer;
  };

// --- case 1: flag -> confirmed by stubbing -> no gap -> deletion stands ---
{
  const seen = [];
  const { result, logs } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence: mkEvidence() },
    agent: scripted(
      {
        Judge: (p, o) =>
          o.label.startsWith("judge:uniqueness") ? AXIOM1_FLAG : PASS,
        Confirm: CONFIRMED,
        Defend: NO_GAP,
      },
      seen,
    ),
  });
  assert.equal(result.failed, false);
  assert.equal(result.findings.length, 1, "one finding");
  const f = result.findings[0];
  assert.equal(f.action, "delete");
  assert.equal(f.confirmation.status, "confirmed");
  assert.equal(f.confirmation.stubbed, SYMBOL);
  assert.equal(f.layer, "server-db");
  assert.equal(f.defence.gapFound, false);
  const confirmCall = seen.find((s) => s.phase === "Confirm");
  assert.equal(
    confirmCall.isolation,
    "worktree",
    "confirm runs in a disposable worktree",
  );
  assert.match(
    confirmCall.prompt,
    /pnpm --filter web run test a\.test\.ts/,
    "target run command in prompt",
  );
  assert.match(
    confirmCall.prompt,
    /pnpm --filter web run test b\.test\.ts/,
    "covering run command derived",
  );
  assert.match(
    confirmCall.prompt,
    new RegExp(SYMBOL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    "shared symbol is the stub target",
  );
  assert.equal(result.counts.kept, 0);
  assert.equal(result.counts.confirmed, 1);
  assert.ok(
    logs.some((l) => l.includes("1 covering claims confirmed")),
    logs.join("|"),
  );
  console.log(
    "case 1 OK  confirmed deletion stands; counts:",
    JSON.stringify(result.counts),
  );
}

// --- case 2: covering test does not fail under the stub -> claim refuted, no adversary spent ---
{
  const seen = [];
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted(
      {
        Judge: AXIOM1_FLAG,
        Confirm: {
          ...CONFIRMED,
          covering: [{ id: COVERING_ID, failed: false }],
        },
        Defend: NO_GAP,
      },
      seen,
    ),
  });
  assert.deepEqual(result.findings, [], "a refuted claim is not a finding");
  assert.equal(result.refuted.length, 1);
  assert.match(result.refuted[0].reason, /no named covering test/);
  assert.ok(
    !seen.some((s) => s.phase === "Defend"),
    "no adversary on a refuted flag",
  );
  assert.equal(result.counts.kept, 1, "the test is kept");
  console.log(
    "case 2 OK  refuted when covering test survives the stub; no adversary spend",
  );
}

// --- case 3: flagged test itself survives the stub -> premise wrong, refuted ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted({
      Judge: AXIOM1_FLAG,
      Confirm: { ...CONFIRMED, target_failed: false },
    }),
  });
  assert.deepEqual(result.findings, []);
  assert.match(result.refuted[0].reason, /did not fail the flagged test/);
  console.log(
    "case 3 OK  refuted when the flagged test does not depend on the stubbed function",
  );
}

// --- case 4: the stub run could not execute -> the whole review aborts, nothing reported ---
{
  const { result, logs } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence: mkEvidence() },
    agent: scripted({
      Judge: (p, o) =>
        o.label.startsWith("judge:uniqueness")
          ? AXIOM1_FLAG
          : {
              ...PASS,
              verdict: "flag",
              axiom: "6",
              action: "comment",
              reason: "db round-trip for a pure mapping",
            },
      Confirm: {
        ran: false,
        reason_not_run: "connect ECONNREFUSED 127.0.0.1:5432",
        stubbed: SYMBOL,
        target_failed: false,
        covering: [],
        evidence: "",
      },
      Defend: NO_GAP,
    }),
  });
  assert.equal(result.failed, true);
  assert.deepEqual(
    result.findings,
    [],
    "no findings at all, not even the placement comment",
  );
  assert.equal(result.failures[0].stage, "confirm");
  assert.match(result.failures[0].reason, /ECONNREFUSED/);
  assert.ok(
    logs.some((l) => l.startsWith("ABORTED")),
    logs.join("|"),
  );
  console.log("case 4 OK  an unrunnable stub aborts the run with the reason");
}

// --- case 5: unevidenced axiom-1 flag is dropped before any confirm/adversary spend ---
{
  const evidence = mkEvidence();
  evidence.tests[0].candidates = [];
  const seen = [];
  const { result } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence, onlyRules: ["uniqueness"] },
    agent: scripted(
      {
        Judge: {
          ...AXIOM1_FLAG,
          covered_by: [{ id: "ghost.test.ts::nope", why: "invented" }],
        },
      },
      seen,
    ),
  });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.refuted, []);
  assert.ok(
    seen.every((s) => s.phase === "Judge"),
    "only judges ran",
  );
  console.log(
    "case 5 OK  unevidenced axiom-1 flag discarded, no confirm or adversary spend",
  );
}

// --- case 6: a judge citing a candidate that was not offered is discarded ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted({
      Judge: {
        ...AXIOM1_FLAG,
        covered_by: [
          { id: "hallucinated.test.ts::not offered", why: "made up" },
        ],
      },
    }),
  });
  assert.deepEqual(result.findings, []);
  console.log("case 6 OK  hallucinated covering test filtered");
}

// --- case 7: adversary finds a gap on a confirmed flag -> downgraded to comment ---
{
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["uniqueness"],
    },
    agent: scripted({
      Judge: AXIOM1_FLAG,
      Confirm: CONFIRMED,
      Defend: {
        gap_found: true,
        gap: "only this test passes a null token",
        quote: "expect(v(null))",
        covering_test: COVERING_ID,
      },
    }),
  });
  const f = result.findings[0];
  assert.equal(f.action, "comment");
  assert.equal(f.downgraded, true);
  assert.equal(
    f.confirmation.status,
    "confirmed",
    "confirmation is kept on the comment",
  );
  assert.equal(result.counts.kept, 1);
  console.log(
    "case 7 OK  defended flag downgraded; counts:",
    JSON.stringify(result.counts),
  );
}

// --- case 8: rewrite gate outcomes, including an unrunnable gate aborting the run ---
for (const [gateOut, expected] of [
  [{ ran: true, ambiguous: false, failed_when_stubbed: true }, "rewrite"],
  [{ ran: true, ambiguous: false, failed_when_stubbed: false }, "comment"],
  [{ ran: true, ambiguous: true, failed_when_stubbed: false }, "suggest-only"],
  [
    {
      ran: false,
      reason_not_run: "clickhouse: connection refused",
      ambiguous: false,
      failed_when_stubbed: false,
    },
    "ABORT",
  ],
]) {
  const { result } = await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["ownership"],
    },
    agent: scripted({
      Judge: {
        verdict: "flag",
        axiom: "2",
        reason: "asserts on a spy",
        confidence: "high",
        action: "rewrite",
        covered_by: [],
      },
      Defend: NO_GAP,
      Gate: (p, o) => {
        assert.equal(
          o.isolation,
          "worktree",
          "gate runs in an isolated worktree",
        );
        assert.match(
          p,
          /pnpm --filter web run test a\.test\.ts/,
          "gate uses the evidence's run command",
        );
        return {
          replacement: 'it("rewritten", () => { expect(result).toEqual(row) })',
          subject: "validateToken",
          evidence: "-> 1 failed",
          ...gateOut,
        };
      },
    }),
  });
  if (expected === "ABORT") {
    assert.equal(result.failed, true);
    assert.equal(result.failures[0].stage, "gate");
    console.log("case 8 OK  unrunnable gate aborts the run");
    continue;
  }
  const f = result.findings[0];
  assert.equal(
    f.action,
    expected,
    `gate(${JSON.stringify(gateOut)}) -> ${expected}, got ${f.action}`,
  );
  if (expected === "rewrite") assert.ok(f.replacement && f.gate.passed);
  if (expected === "comment") assert.equal(f.gate.passed, false);
  console.log(`case 8 OK  gate ${JSON.stringify(gateOut)} -> ${f.action}`);
}

// --- case 9: empty scope returns cleanly without spawning agents ---
{
  let spawned = 0;
  const { result, logs } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence: mkEvidence({ tests: [] }) },
    agent: async () => {
      spawned += 1;
      return null;
    },
  });
  assert.equal(spawned, 0);
  assert.deepEqual(result.findings, []);
  assert.equal(result.failed, false);
  assert.ok(logs.some((l) => l.includes("no changed tests")));
  console.log("case 9 OK  empty scope short-circuits");
}

// --- case 10: a dead judge agent (null) does not crash the pipeline ---
{
  const { result } = await run(REVIEW, {
    args: { skillDir: "/skill", evidence: mkEvidence() },
    agent: async () => null,
  });
  assert.deepEqual(result.findings, []);
  assert.equal(
    result.failed,
    false,
    "a silent judge is a pass, not an environment failure",
  );
  console.log("case 10 OK  null judge tolerated");
}

// --- case 11: the judge sees layer, run command and shared symbols ---
{
  let prompt = "";
  await run(REVIEW, {
    args: {
      skillDir: "/skill",
      evidence: mkEvidence(),
      onlyRules: ["placement"],
    },
    agent: scripted({
      Judge: (p) => {
        prompt = p;
        return PASS;
      },
    }),
  });
  assert.match(prompt, /layer: server-db \(uses database or redis\)/);
  assert.match(prompt, /runs with: pnpm --filter web run test a\.test\.ts/);
  assert.match(prompt, /both call validateToken/);
  assert.match(prompt, /will be CONFIRMED after you return by stubbing/);
  assert.doesNotMatch(prompt, /DEGRADED/);
  console.log(
    "case 11 OK  judge prompt carries layer, runner and shared symbols",
  );
}

console.log("\nall dry-run cases passed");
