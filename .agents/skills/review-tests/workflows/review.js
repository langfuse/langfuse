export const meta = {
  name: "review-tests",
  description:
    "Review changed tests against the redundancy axioms, confirm each covering claim by stubbing, defend each flag, gate every rewrite",
  phases: [
    {
      title: "Judge",
      detail: "one judge per test per rule file",
      model: "claude-sonnet-4-6",
    },
    {
      title: "Confirm",
      detail: "stub the shared function; the covering test must fail too",
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

// Each stage is configured separately so one can move to a stronger model
// without repricing the others.
const JUDGE = "claude-sonnet-4-6";
const CONFIRMER = "claude-sonnet-4-6";
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

const CONFIRMATION = {
  type: "object",
  properties: {
    ran: {
      type: "boolean",
      description:
        "true only if every listed test file ran to completion with the stub in place",
    },
    reason_not_run: {
      type: "string",
      description: "when ran is false: exactly what prevented the run",
    },
    stubbed: {
      type: "string",
      description: "the production function(s) replaced with a no-op",
    },
    target_failed: {
      type: "boolean",
      description: "the flagged test failed with the stub in place",
    },
    covering: {
      type: "array",
      description: "one entry per covering test named in the flag",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          failed: { type: "boolean" },
        },
        required: ["id", "failed"],
      },
    },
    evidence: {
      type: "string",
      description: "each command run and the failure lines observed",
    },
  },
  required: ["ran", "stubbed", "target_failed", "covering", "evidence"],
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
    ran: {
      type: "boolean",
      description:
        "true only if the test file ran to completion with the stub in place",
    },
    reason_not_run: {
      type: "string",
      description: "when ran is false: exactly what prevented the run",
    },
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
    "ran",
    "replacement",
    "subject",
    "ambiguous",
    "failed_when_stubbed",
    "evidence",
  ],
};

// args: { skillDir, evidence: <gather.mjs output>, onlyRules?: ['uniqueness', ...],
//         models?: { judge?, confirm?, adversary?, rewrite? } }
const { skillDir, evidence, onlyRules } = args;
const models = args.models ?? {};
const rulesDir = `${skillDir}/rules`;
const tests = evidence.tests ?? [];

const rules = RULES.filter((r) => !onlyRules || onlyRules.includes(r.id));

// Environment failures — a stub run that could not execute — abort the whole
// review. The service stack is a precondition the scout guarantees; a finding
// that rests on "could not check" is never posted.
const failures = [];

const indent = (text) =>
  text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");

const shortSymbol = (s) => s.split("#")[1] ?? s;

const candidateBlock = (test) =>
  test.candidates.length
    ? test.candidates
        .map(
          (c, i) =>
            `[candidate ${i + 1}] id: ${c.id}\n  location: ${c.file}:${c.line}\n  why offered: ${c.basis}${c.sharedSymbols?.length ? `; both call ${c.sharedSymbols.map(shortSymbol).join(", ")}` : ""} (overlap ${c.overlap})\n  source:\n${indent(c.source)}`,
        )
        .join("\n\n")
    : "(none — no other test in the suite calls the production functions this one calls)";

const judgePrompt = (
  rule,
  test,
) => `You are reviewing ONE test against ONE rule file. Read the rule first — it is the whole rubric, including its "Do not flag" list, which overrides your instincts:

cat ${rulesDir}/${rule.file}

Run that command exactly as written from your current working directory. Do not open the test files; their full source is below. Use grep or a targeted read ONLY to check a claim the evidence cannot answer — whether a schema now forbids a shape (axiom 7), or whether a cheaper seam exists (axiom 6).

Rule: ${rule.id} (axioms ${rule.axioms})
Mode: ${evidence.mode}
Candidates: ${evidence.candidateBasis}. An axiom 1 flag you raise will be CONFIRMED after you return by stubbing the shared function and running both tests; your job is to judge from the sources, not to prove.

=== TEST UNDER REVIEW ===
id: ${test.id}
location: ${test.file}:${test.line}
name: ${test.name}
layer: ${test.layer}${test.touchesServices ? " (uses database or redis)" : ""}
runs with: ${test.runCommand}
parameterized: ${test.parameterized}
assertions found: ${test.assertions.length ? test.assertions.join(" | ") : "(none)"}
production functions it calls:
${test.symbols.length ? test.symbols.map((s) => `  - ${s}`).join("\n") : "  (none resolved)"}
production modules it imports:
${test.imports.length ? test.imports.map((i) => `  - ${i}`).join("\n") : "  (none resolved)"}
source:
${indent(test.source)}

=== CANDIDATE COVERING TESTS ===
${candidateBlock(test)}

Apply only rule ${rule.id}. Walk its Flag list item by item, then its "Do not flag" list, and let the second win any tie. Default to \`pass\`: a test you are unsure about stays. Return \`verdict: "pass"\` with an empty \`covered_by\` when nothing fires.

For a flag: set \`axiom\` to the single axiom number it rests on, \`reason\` to one line a reviewer can act on, and \`action\` to one of delete, rewrite, or comment as the rule's Verdict section directs. An axiom 1 flag MUST list every covering test in \`covered_by\` using the candidate ids exactly as given above; if you cannot fill it from the candidates shown, return \`pass\` instead. Never cite a candidate that is not listed above.`;

const confirmPrompt = (
  finding,
  covering,
  stubTargets,
) => `You confirm or refute one redundancy claim by measurement. A judge says the FLAGGED test is already covered by the COVERING tests because they exercise the same production function. If that is true, stubbing that function makes all of them fail. Run it in the worktree you are in; it is disposable.

=== FLAGGED TEST ===
id: ${finding.test.id}
file: ${finding.test.file}
runs with: ${finding.test.runCommand}
source:
${indent(finding.test.source)}

=== COVERING TESTS ===
${covering
  .map(
    (c) =>
      `id: ${c.id}\nfile: ${c.file}\nruns with: ${c.runCommand}\nsource:\n${indent(c.source)}`,
  )
  .join("\n\n")}

=== FUNCTION(S) TO STUB ===
${stubTargets.map((s) => `- ${s}`).join("\n")}
(format: <module file>#<export>; a dotted member means a method on that export)

Steps, in order:

1. Open each module file and replace the body of each listed function with a no-op that returns \`undefined\` (or an empty value of its declared return type if it must type-check). Do not touch anything else.
2. Run the flagged test's file with its command, then each covering test's file with its command. Read the per-test results: record whether the FLAGGED test failed, and whether EACH covering test (by name) failed. A suite failing on an unrelated test does not count; look at the named test.
3. Set \`ran: true\` only if every command executed to completion and reported per-test results. If a command could not run — a service refused the connection, a dependency was missing, the runner crashed before reporting — set \`ran: false\` and put the exact error in \`reason_not_run\`. Never infer a result you did not see.
4. Revert every edit. \`git status --porcelain\` must be clean before you return.

Record each command and the failure lines you read in \`evidence\`.`;

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
reason: ${finding.reason}${
    finding.confirmation
      ? `\nconfirmed by stubbing ${finding.confirmation.stubbed}: the flagged test and every covering test failed together`
      : ""
  }

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
) => `You generate and gate a replacement test. A rewrite ships only when it is proven able to fail. Work in the worktree you are in; it is disposable.

=== THE FINDING ===
rule: ${finding.rule} (axiom ${finding.axiom})
reason: ${finding.reason}
test id: ${finding.test.id}
location: ${finding.test.file}:${finding.test.line}
runs with: ${finding.test.runCommand}
current source:
${indent(finding.test.source)}

Steps, in order:

1. Write the replacement test. Keep the file's existing imports, helpers and style; it must be one contiguous block that can replace lines ${finding.test.line}-${finding.test.endLine} of ${finding.test.file}. Fix exactly what the reason names and nothing else.
2. Identify the single production function the replacement pins. If more than one function could be the subject, or you cannot locate it, set \`ambiguous: true\`, \`ran: true\`, \`failed_when_stubbed: false\`, and stop — do not edit anything.
3. Prove it can fail. Apply the replacement, stub that function to a no-op (return undefined, or an empty value of its return type), and run the file: \`${finding.test.runCommand}\`. Set \`failed_when_stubbed: true\` ONLY if you saw the replacement fail with the stub in place. Record the command and the failure line in \`evidence\`.
4. Set \`ran: true\` only if the command executed to completion and reported per-test results. If it could not run — a service refused the connection, a dependency was missing, the runner crashed — set \`ran: false\` with the exact error in \`reason_not_run\`.
5. Revert the stub and the replacement; the replacement is returned as text, not applied. \`git status --porcelain\` must be clean before you return.`;

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

// A covering claim is a measurable statement: stub the shared function and the
// covering test fails alongside the flagged one. Only confirmed claims survive.
const confirm = async (finding) => {
  if (finding.axiom !== "1" || !finding.covered_by.length) return finding;
  const test = finding.test;
  const covering = finding.covered_by
    .map((c) => test.candidates.find((x) => x.id === c.id))
    .filter(Boolean)
    .map((c) => ({ ...c, runCommand: c.runCommand ?? test.runCommand }));
  const shared = [...new Set(covering.flatMap((c) => c.sharedSymbols ?? []))];
  const stubTargets = shared.length ? shared : test.symbols;
  if (!stubTargets.length) {
    // Nothing to stub means nothing to measure; the claim cannot be confirmed.
    return { ...finding, refuted: "no shared production function to stub" };
  }

  const out = await agent(confirmPrompt(finding, covering, stubTargets), {
    label: `confirm:${test.name.slice(0, 40)}`,
    phase: "Confirm",
    schema: CONFIRMATION,
    model: models.confirm ?? CONFIRMER,
    isolation: "worktree",
  });

  if (!out || out.ran === false) {
    failures.push({
      id: test.id,
      stage: "confirm",
      reason: out?.reason_not_run || "confirm agent returned nothing",
    });
    return null;
  }
  if (!out.target_failed) {
    return {
      ...finding,
      refuted: `stubbing ${out.stubbed} did not fail the flagged test; it does not depend on that function`,
    };
  }
  const failed = new Set(out.covering.filter((c) => c.failed).map((c) => c.id));
  const stillCovered = finding.covered_by.filter((c) => failed.has(c.id));
  if (!stillCovered.length) {
    return {
      ...finding,
      refuted: `stubbing ${out.stubbed} failed the flagged test but no named covering test`,
    };
  }
  return {
    ...finding,
    covered_by: stillCovered,
    confirmation: {
      status: "confirmed",
      stubbed: out.stubbed,
      evidence: out.evidence,
      dropped: finding.covered_by.length - stillCovered.length,
    },
  };
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
  if (!out || out.ran === false) {
    failures.push({
      id: finding.test.id,
      stage: "gate",
      reason: out?.reason_not_run || "gate agent returned nothing",
    });
    return null;
  }
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
  return {
    findings: [],
    refuted: [],
    counts: { reviewed: 0, kept: 0 },
    failed: false,
    failures: [],
  };
}

log(
  `${tests.length} tests x ${rules.length} rules; candidates by ${evidence.candidateBasis}`,
);
if (evidence.truncated) {
  log(
    `scope capped: ${evidence.truncated.dropped} tests not reviewed (${evidence.truncated.reason})`,
  );
}

phase("Judge");
// Each (test, rule) pair runs judge -> confirm -> defend -> gate independently,
// so a test flagged by the first rule is already being confirmed while others
// still judge. Refuted findings leave the chain as `refuted` records.
const isLive = (f) => f && !f.refuted;
const pairs = rules.flatMap((rule) => tests.map((test) => ({ rule, test })));
const results = await pipeline(
  pairs,
  (p) => judge(p.rule, p.test),
  (found) => (found.length ? parallel(found.map((f) => () => confirm(f))) : []),
  (confirmed) =>
    parallel(
      confirmed.filter(Boolean).map((f) => () => (isLive(f) ? defend(f) : f)),
    ),
  (defended) =>
    parallel(
      defended.filter(Boolean).map((f) => () => (isLive(f) ? gate(f) : f)),
    ),
);

const all = results.filter(Boolean).flat().filter(Boolean);
const refuted = all
  .filter((f) => f.refuted)
  .map((f) => ({
    id: f.test.id,
    rule: f.rule,
    axiom: f.axiom,
    reason: f.refuted,
  }));

if (failures.length) {
  log(
    `ABORTED: ${failures.length} stub run(s) could not execute — nothing is reported`,
  );
  return { failed: true, failures, findings: [], refuted, counts: null };
}

const findings = all
  .filter((f) => !f.refuted)
  .map((f) => ({
    id: f.test.id,
    file: f.test.file,
    line: f.test.line,
    endLine: f.test.endLine,
    name: f.test.name,
    layer: f.test.layer,
    rule: f.rule,
    axiom: f.axiom,
    action: f.action,
    reason: f.reason,
    confidence: f.confidence,
    coveredBy: f.covered_by,
    confirmation: f.confirmation ?? null,
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
  confirmed: findings.filter((f) => f.confirmation?.status === "confirmed")
    .length,
  refuted: refuted.length,
  defended: findings.filter((f) => f.downgraded).length,
};
log(
  `${counts.reviewed} reviewed, ${counts.kept} kept, ${counts.confirmed} covering claims confirmed, ${counts.refuted} refuted, ${counts.defended} flags defended`,
);

return {
  failed: false,
  failures: [],
  findings,
  refuted,
  counts,
  truncated: evidence.truncated ?? null,
};
