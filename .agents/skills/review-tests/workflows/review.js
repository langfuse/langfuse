export const meta = {
  name: "review-tests",
  description:
    "Review changed tests against the redundancy axioms, defend each flag, gate every rewrite",
  phases: [
    {
      title: "Judge",
      detail: "one judge per test per rule file",
      model: "claude-sonnet-4-6",
    },
    {
      title: "Defend",
      detail: "one adversary per flag",
      model: "claude-sonnet-4-6",
    },
    {
      title: "Gate",
      detail: "a rewrite ships only if it fails against stubbed code",
      model: "claude-sonnet-4-6",
    },
  ],
};

// Judges, adversaries and the rewrite gate are configured per stage so the gate
// can move to a stronger model without repricing the judges.
const JUDGE = "claude-sonnet-4-6";
const ADVERSARY = "claude-sonnet-4-6";
const REWRITE = "claude-sonnet-4-6";

const RULES = [
  { id: "uniqueness", file: "uniqueness.md", axioms: "1, 4, 5, 7" },
  { id: "ownership", file: "ownership.md", axioms: "2, 3" },
  { id: "placement", file: "placement.md", axioms: "6, 8" },
];

const VERDICTS = ["flag", "pass"];
const ACTIONS = ["delete", "rewrite", "comment"];

const JUDGEMENT = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: VERDICTS },
    axiom: {
      type: "string",
      description: 'the axiom number this rests on, e.g. "1"',
    },
    reason: {
      type: "string",
      description: "one line: why this test does not earn its place",
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    action: { type: "string", enum: ACTIONS },
    covered_by: {
      type: "array",
      description: "required for an axiom 1 flag: one entry per covering test",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "candidate test id, copied exactly",
          },
          why: {
            type: "string",
            description: "one line: what it already covers",
          },
        },
        required: ["id", "why"],
      },
    },
  },
  required: [
    "verdict",
    "axiom",
    "reason",
    "confidence",
    "action",
    "covered_by",
  ],
};

const DEFENCE = {
  type: "object",
  properties: {
    gap_found: { type: "boolean" },
    gap: {
      type: "string",
      description: "one sentence naming the unique input or assertion",
    },
    quote: {
      type: "string",
      description:
        "the verbatim line(s) from the flagged test carrying the gap",
    },
    covering_test: {
      type: "string",
      description: "the covering test that lacks it",
    },
    checked: { type: "string", description: "when no gap: what was compared" },
  },
  required: ["gap_found"],
};

const GATE = {
  type: "object",
  properties: {
    replacement: {
      type: "string",
      description: "the full replacement test, one contiguous block",
    },
    subject: {
      type: "string",
      description:
        'the production function the replacement pins, or "" if ambiguous',
    },
    ambiguous: {
      type: "boolean",
      description:
        "true when the function under test cannot be identified unambiguously",
    },
    failed_when_stubbed: {
      type: "boolean",
      description:
        "true only if the replacement was observed failing against stubbed code",
    },
    evidence: {
      type: "string",
      description: "the command run and the failure line observed",
    },
  },
  required: [
    "replacement",
    "subject",
    "ambiguous",
    "failed_when_stubbed",
    "evidence",
  ],
};

// args: { skillDir, evidence: <gather.mjs output>, models?: { judge?, adversary?, rewrite? },
//         onlyRules?: ['uniqueness', ...] }
const { skillDir, evidence, onlyRules } = args;
const models = args.models ?? {};
const rulesDir = `${skillDir}/rules`;
const tests = evidence.tests ?? [];

const rules = RULES.filter((r) => !onlyRules || onlyRules.includes(r.id));

const degradedNote = evidence.degraded
  ? `\nCandidate selection is DEGRADED: ${evidence.degradedReason}. Shared imports are weaker evidence than measured coverage — two tests importing one module may exercise different functions in it. Cap confidence at medium for axiom 1 flags and say so in the reason.`
  : "";

const candidateBlock = (test) =>
  test.candidates.length
    ? test.candidates
        .map(
          (c, i) =>
            `[candidate ${i + 1}] id: ${c.id}\n  location: ${c.file}:${c.line}\n  why offered: ${c.basis} (overlap ${c.overlap})\n  source:\n${indent(c.source)}`,
        )
        .join("\n\n")
    : "(none — no other test in the suite shares this one's production imports or covered lines)";

const indent = (text) =>
  text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");

const judgePrompt = (
  rule,
  test,
) => `You are reviewing ONE test against ONE rule file. Read the rule first — it is the whole rubric, including its "Do not flag" list, which overrides your instincts:

cat ${rulesDir}/${rule.file}

Run that command exactly as written from your current working directory. Do not open the test files; their full source is below. Use grep or a targeted read ONLY to check a claim the evidence cannot answer — whether a schema now forbids a shape (axiom 7), or whether a cheaper seam exists (axiom 6).

Rule: ${rule.id} (axioms ${rule.axioms})
Mode: ${evidence.mode}${degradedNote}

=== TEST UNDER REVIEW ===
id: ${test.id}
location: ${test.file}:${test.line}
name: ${test.name}
parameterized: ${test.parameterized}
assertions found: ${test.assertions.length ? test.assertions.join(" | ") : "(none)"}
production modules it imports:
${test.imports.length ? test.imports.map((i) => `  - ${i}`).join("\n") : "  (none resolved)"}
source:
${indent(test.source)}

=== CANDIDATE COVERING TESTS ===
${candidateBlock(test)}

Apply only rule ${rule.id}. Walk its Flag list item by item, then its "Do not flag" list, and let the second win any tie. Default to \`pass\`: a test you are unsure about stays. Return \`verdict: "pass"\` with an empty \`covered_by\` when nothing fires.

For a flag: set \`axiom\` to the single axiom number it rests on, \`reason\` to one line a reviewer can act on, and \`action\` to one of delete, rewrite, or comment as the rule's Verdict section directs. An axiom 1 flag MUST list every covering test in \`covered_by\` using the candidate ids exactly as given above; if you cannot fill it from the candidates shown, return \`pass\` instead. Never cite a candidate that is not listed above.`;

const defencePrompt = (finding) => {
  const test = finding.test;
  const covering = finding.covered_by?.length
    ? finding.covered_by
        .map((c) => {
          const match = test.candidates.find((x) => x.id === c.id);
          return `id: ${c.id}\n  judge says it covers: ${c.why}\n  source:\n${match ? indent(match.source) : "    (source unavailable)"}`;
        })
        .join("\n\n")
    : test.candidates
        .map((c) => `id: ${c.id}\n  source:\n${indent(c.source)}`)
        .join("\n\n");

  return `You defend one flagged test against deletion. Read your brief first:

cat ${rulesDir}/adversary.md

Run it exactly as written from your current working directory. Do not open the test files; the sources are below.

=== THE FLAG ===
rule: ${finding.rule} (axiom ${finding.axiom})
action proposed: ${finding.action}
reason: ${finding.reason}

=== FLAGGED TEST ===
id: ${test.id}
location: ${test.file}:${test.line}
source:
${indent(test.source)}

=== COVERING TESTS NAMED BY THE JUDGE ===
${covering || "(none named)"}

Name one specific input or assertion the flagged test exercises that these covering tests do not. Quote it verbatim from the flagged test's source. If every input class and assertion is already covered, return \`gap_found: false\` and say in one line what you compared. A gap you will not quote is not a gap.`;
};

const gatePrompt = (
  finding,
) => `You generate and gate a replacement test. A rewrite ships only when it is proven able to fail.

=== THE FINDING ===
rule: ${finding.rule} (axiom ${finding.axiom})
reason: ${finding.reason}
test id: ${finding.test.id}
location: ${finding.test.file}:${finding.test.line}
current source:
${indent(finding.test.source)}

Steps, in order:

1. Write the replacement test. Keep the file's existing imports, helpers and style; it must be one contiguous block that can replace lines ${finding.test.line}-${finding.test.endLine} of ${finding.test.file}. Fix exactly what the reason names and nothing else.
2. Identify the single production function the replacement pins. If more than one function could be the subject, or you cannot locate it, set \`ambiguous: true\`, set \`failed_when_stubbed: false\`, and stop — do not edit anything.
3. Prove it can fail. Apply the replacement, stub that function to a no-op (return undefined, or an empty value of its return type), and run the one test file:
   - worker: \`pnpm --filter worker run test ${finding.test.file}\`
   - web servertest: \`pnpm --filter web run test ${finding.test.file}\`
   - web clienttest: \`pnpm --filter web run test-client ${finding.test.file}\`
   - shared: \`pnpm --filter @langfuse/shared run test ${finding.test.file}\`
   Set \`failed_when_stubbed: true\` ONLY if you saw the replacement fail with the stub in place. Record the command and the failure line in \`evidence\`.
4. Revert the stub. Leave the worktree exactly as you found it — revert the replacement too; it is returned as text, not applied here. Confirm with \`git status --porcelain\` and \`git diff --stat\` before returning.

If the test cannot run in this environment (missing database, missing services), set \`failed_when_stubbed: false\` and say so in \`evidence\`. Never report a gate you did not observe.`;

const judge = async (rule, test) => {
  const out = await agent(judgePrompt(rule, test), {
    label: `judge:${rule.id}:${test.name.slice(0, 40)}`,
    phase: "Judge",
    schema: JUDGEMENT,
    model: models.judge ?? JUDGE,
  });
  if (!out || out.verdict !== "flag") return [];
  // The rule file forbids an unevidenced axiom 1 flag; enforce it in script so a
  // judge that ignores the instruction cannot produce an unciteable finding.
  if (out.axiom === "1" && !(out.covered_by ?? []).length) return [];
  if (out.axiom === "1" && !test.candidates.length) return [];
  const known = new Set(test.candidates.map((c) => c.id));
  const covered = (out.covered_by ?? []).filter((c) => known.has(c.id));
  if (out.axiom === "1" && !covered.length) return [];
  return [{ ...out, covered_by: covered, rule: rule.id, test }];
};

const defend = async (finding) => {
  if (finding.action === "comment") return finding;
  // Nothing to defend against when no covering test was named.
  if (!finding.covered_by.length && finding.axiom === "1") return finding;
  const out = await agent(defencePrompt(finding), {
    label: `defend:${finding.rule}:${finding.test.name.slice(0, 40)}`,
    phase: "Defend",
    schema: DEFENCE,
    model: models.adversary ?? ADVERSARY,
  });
  if (!out) return { ...finding, defence: null };
  if (!out.gap_found)
    return {
      ...finding,
      defence: { gapFound: false, checked: out.checked ?? "" },
    };
  // A defended test is not deleted; the gap becomes the comment's substance.
  return {
    ...finding,
    action: "comment",
    downgraded: true,
    defence: {
      gapFound: true,
      gap: out.gap,
      quote: out.quote,
      coveringTest: out.covering_test,
    },
  };
};

const gate = async (finding) => {
  if (finding.action !== "rewrite") return finding;
  const out = await agent(gatePrompt(finding), {
    label: `gate:${finding.test.name.slice(0, 40)}`,
    phase: "Gate",
    schema: GATE,
    model: models.rewrite ?? REWRITE,
    isolation: "worktree",
  });
  if (!out)
    return {
      ...finding,
      action: "comment",
      gate: { passed: false, reason: "gate agent returned nothing" },
    };
  if (out.ambiguous) {
    return {
      ...finding,
      action: "suggest-only",
      replacement: out.replacement,
      gate: {
        passed: false,
        reason: "function under test not identifiable unambiguously",
        evidence: out.evidence,
      },
    };
  }
  if (!out.failed_when_stubbed) {
    return {
      ...finding,
      action: "comment",
      gate: {
        passed: false,
        reason: "replacement did not fail against stubbed code",
        evidence: out.evidence,
      },
    };
  }
  return {
    ...finding,
    replacement: out.replacement,
    gate: { passed: true, subject: out.subject, evidence: out.evidence },
  };
};

if (!tests.length) {
  log("no changed tests in scope");
  return { findings: [], reviewed: 0, kept: 0, degraded: !!evidence.degraded };
}

log(
  `${tests.length} tests x ${rules.length} rules${evidence.degraded ? " (degraded candidates)" : ""}`,
);
if (evidence.truncated) {
  log(
    `scope capped: ${evidence.truncated.dropped} tests not reviewed (${evidence.truncated.reason})`,
  );
}

phase("Judge");
// Each (test, rule) pair runs judge -> defend -> gate independently, so a test
// flagged by the first rule is already being defended while others still judge.
const pairs = rules.flatMap((rule) => tests.map((test) => ({ rule, test })));
const results = await pipeline(
  pairs,
  (p) => judge(p.rule, p.test),
  (found) => (found.length ? parallel(found.map((f) => () => defend(f))) : []),
  (defended) =>
    defended.filter(Boolean).length
      ? parallel(defended.filter(Boolean).map((f) => () => gate(f)))
      : [],
);

const findings = results
  .filter(Boolean)
  .flat()
  .filter(Boolean)
  .map((f) => ({
    id: f.test.id,
    file: f.test.file,
    line: f.test.line,
    endLine: f.test.endLine,
    name: f.test.name,
    rule: f.rule,
    axiom: f.axiom,
    action: f.action,
    reason: f.reason,
    confidence: f.confidence,
    coveredBy: f.covered_by,
    defence: f.defence ?? null,
    downgraded: !!f.downgraded,
    replacement: f.replacement ?? null,
    gate: f.gate ?? null,
  }))
  .sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.rule.localeCompare(b.rule),
  );

const flaggedIds = new Set(
  findings.filter((f) => f.action !== "comment").map((f) => f.id),
);
const counts = {
  reviewed: tests.length,
  kept: tests.length - flaggedIds.size,
  deletions: findings.filter((f) => f.action === "delete").length,
  rewrites: findings.filter((f) => f.action === "rewrite").length,
  comments: findings.filter((f) => f.action === "comment").length,
  suggestOnly: findings.filter((f) => f.action === "suggest-only").length,
  defended: findings.filter((f) => f.downgraded).length,
};
log(
  `${counts.reviewed} reviewed, ${counts.kept} kept, ${counts.defended} flags defended`,
);

return {
  findings,
  counts,
  degraded: !!evidence.degraded,
  truncated: evidence.truncated ?? null,
};
