export const meta = {
  name: "review-tests",
  description:
    "Review changed tests against the redundancy axioms: one judge per rule per cluster flags, one reviewer per chunk decides delete or edit",
  phases: [
    {
      title: "Judge",
      detail: "one judge per rule file per cluster",
      model: "claude-sonnet-4-6",
    },
    {
      title: "Review",
      detail: "one reviewer per chunk of clusters that share a test",
      model: "claude-opus-4-8",
    },
  ],
};

// Judges are cheap and per-rule; the reviewer reconciles a whole chunk and
// decides the edits, so it runs on the stronger model. Each is overridable.
const JUDGE = "claude-sonnet-4-6";
const REVIEWER = "claude-opus-4-8";

const RULES = [
  { id: "uniqueness", file: "uniqueness.md" },
  { id: "ownership", file: "ownership.md" },
];

const FLAGS = {
  type: "object",
  properties: {
    flags: {
      type: "array",
      description: "one entry per member test this rule flags; empty when none",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          line: {
            type: "integer",
            description:
              "the flagged block's starting line, copied from the list",
          },
          reason: {
            type: "string",
            description: "one line: why this test does not earn its place",
          },
        },
        required: ["file", "line", "reason"],
      },
    },
  },
  required: ["flags"],
};

const LOCATION = {
  type: "object",
  properties: { file: { type: "string" }, line: { type: "integer" } },
  required: ["file", "line"],
};

const FINDINGS = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          line: { type: "integer" },
          verdict: { type: "string", enum: ["delete", "edit"] },
          comment: {
            type: "string",
            description:
              "the guidance a reader acts on; no axiom numbers, no em or en dashes",
          },
          suggestion: {
            type: "string",
            description:
              "edit only: the full replacement test as one contiguous block; empty for a delete",
          },
          coveredBy: {
            ...LOCATION,
            description:
              "delete only: the surviving test that already covers this one, or that a paired edit folds it into",
          },
          fold: {
            type: "boolean",
            description:
              "delete only: true when coveredBy is a survivor being edited to absorb this test",
          },
          absorbs: {
            type: "array",
            description: "edit only: the deleted tests this rewrite folds in",
            items: LOCATION,
          },
        },
        required: ["file", "line", "verdict", "comment"],
      },
    },
  },
  required: ["findings"],
};

// args: { skillDir, evidence: <gather.mjs output>, onlyRules?: ['uniqueness', ...],
//         models?: { judge?, reviewer? } }
const { skillDir, evidence } = args;
const onlyRules = args.onlyRules;
const models = args.models ?? {};
const rulesDir = `${skillDir}/rules`;

const rawClusters = evidence.clusters ?? [];
// A stable id by position lets a judge's flags and the chunker refer to a
// cluster without carrying the whole object; only located clusters are review-
// able, the rest are reported as skipped.
const clusters = rawClusters
  .map((c, i) => ({ ...c, id: i }))
  .filter((c) => c.ok);
const rules = RULES.filter((r) => !onlyRules || onlyRules.includes(r.id));

const shortSymbol = (s) => s.split("#")[1] ?? s;
const testKey = (t) => `${t.file}:::${t.line}`;

// Canonical version lives in scripts/lib/chunker.mjs, unit-tested there; a
// Workflow script cannot import, so the algorithm is inlined. workflow-logic's
// "chunker unions correctly" case pins that this copy agrees.
function chunkClusters(clusterList, candidates) {
  const byCluster = new Map();
  for (const candidate of candidates) {
    if (!byCluster.has(candidate.clusterId))
      byCluster.set(candidate.clusterId, []);
    byCluster.get(candidate.clusterId).push(candidate);
  }
  const participating = clusterList.filter((cluster) =>
    byCluster.has(cluster.id),
  );

  const parent = new Map(
    participating.map((cluster) => [cluster.id, cluster.id]),
  );
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => parent.set(find(a), find(b));

  const clustersByTest = new Map();
  for (const cluster of participating) {
    for (const t of cluster.tests) {
      const key = testKey(t);
      if (!clustersByTest.has(key)) clustersByTest.set(key, []);
      clustersByTest.get(key).push(cluster.id);
    }
  }
  for (const ids of clustersByTest.values()) {
    for (let i = 1; i < ids.length; i += 1) union(ids[0], ids[i]);
  }

  const groups = new Map();
  for (const cluster of participating) {
    const root = find(cluster.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(cluster);
  }

  const chunks = [];
  for (const group of groups.values()) {
    const grouped = [...group].sort((a, b) => a.id - b.id);
    const candidateList = grouped
      .flatMap((cluster) => byCluster.get(cluster.id) ?? [])
      .sort(
        (a, b) =>
          a.file.localeCompare(b.file) ||
          a.line - b.line ||
          a.rule.localeCompare(b.rule),
      );
    chunks.push({ clusters: grouped, candidates: candidateList });
  }
  return chunks.sort((a, b) => a.clusters[0].id - b.clusters[0].id);
}

const judgePrompt = (rule, cluster) => {
  const files = [...new Set(cluster.tests.map((t) => t.file))];
  const members = cluster.tests
    .map((t) => `  - ${t.file}:${t.line}`)
    .join("\n");
  return `You review ONE rule against ONE cluster of tests. Read the rule first, it is the whole rubric including its "Do not flag" list, then the test files:

cat ${rulesDir}/${rule.file} && grep -nH '' ${files.join(" ")}

Run that command exactly as written from your current working directory; the paths are relative to it, so do not cd or prefix them. Do not open the files again; you have them. Use grep only to check a claim the sources cannot answer, such as whether a schema now forbids a shape.

Rule: ${rule.id}
This cluster is the production symbol ${cluster.code.symbol} (defined at line ${cluster.code.line}) and the test blocks that reference it:
${members}

Judge each listed member block against rule ${rule.id} only. Walk its Flag list item by item, then its "Do not flag" list, and let the second win any tie. Default to leaving a test alone; flag only one you can name a concrete reason for. Return one flag per member block that violates the rule, citing the block's own file and its starting line exactly as listed above, with a one-line reason. Return an empty list when nothing fires. Never flag a block that is not listed above.`;
};

const reviewerPrompt = (chunk) => {
  const files = [
    ...new Set(chunk.clusters.flatMap((cl) => cl.tests.map((t) => t.file))),
  ];
  const ruleFiles = rules.map((r) => `${rulesDir}/${r.file}`).join(" ");
  const clusterBlock = chunk.clusters
    .map(
      (cl) =>
        `symbol ${cl.code.symbol} (line ${cl.code.line})\n${cl.tests
          .map((t) => `    - ${t.file}:${t.line}`)
          .join("\n")}`,
    )
    .join("\n\n");
  const flagBlock = chunk.candidates
    .map((c) => `  - ${c.file}:${c.line} [${c.rule}] ${c.reason}`)
    .join("\n");
  return `You are the reviewer. Judges flagged some tests as redundant or weak; you decide what to actually do. Read the rubric and every test in this chunk first:

cat ${ruleFiles} && grep -nH '' ${files.join(" ")}

Run that command exactly as written from your current working directory; the paths are relative to it, so do not cd or prefix them. Use grep or a targeted read only to reach production code a decision turns on. Change nothing on disk; your findings are returned, not applied.

This chunk groups clusters that share a test, so you can reconcile a delete against a survivor another cluster also touches. The clusters:

${clusterBlock}

Flagged tests (a judge's reason, not a verdict):
${flagBlock}

For each flagged test decide exactly one of:
- delete: another test already fails for this bug. verdict "delete", coveredBy that surviving test's file and line, fold false; put the reason in comment. Dropping it must lose no coverage.
- delete that consolidates: the flagged test carries a unique assertion that belongs on a survivor. verdict "delete", coveredBy the survivor, fold true; and add a second finding, an edit on that survivor whose absorbs lists this test, so the assertion moves and nothing is lost.
- edit: the test has a real reason buried in a redundant or unfailable shape. verdict "edit", suggestion the full replacement block. An edit only stands if the rewritten test still pins behavior worth pinning; if the honest rewrite is a trivial getter, constructor, or ORM check, delete it instead.
- keep: omit it. Silence is a keep.

Emit at most one finding per (file, line). Every finding, coveredBy, and absorbs entry must name a test that appears in this chunk. Write comment as plain guidance: no axiom numbers, no em or en dashes.`;
};

const judge = async (rule, cluster) => {
  const out = await agent(judgePrompt(rule, cluster), {
    label: `judge:${rule.id}:${shortSymbol(cluster.code.symbol).slice(0, 30)}`,
    phase: "Judge",
    schema: FLAGS,
    model: models.judge ?? JUDGE,
  });
  if (!out) return [];
  // Discard a flag that cites nothing usable: it must name a member block of
  // this cluster, not an invented location.
  const members = new Set(cluster.tests.map(testKey));
  return (out.flags ?? [])
    .filter((f) => members.has(testKey(f)))
    .map((f) => ({
      clusterId: cluster.id,
      rule: rule.id,
      file: f.file,
      line: f.line,
      reason: f.reason,
    }));
};

const review = async (chunk) => {
  const out = await agent(reviewerPrompt(chunk), {
    label: `review:${chunk.clusters
      .map((c) => shortSymbol(c.code.symbol))
      .join(",")
      .slice(0, 40)}`,
    phase: "Review",
    schema: FINDINGS,
    model: models.reviewer ?? REVIEWER,
  });
  if (!out) return [];
  const members = new Set(
    chunk.clusters.flatMap((cl) => cl.tests.map(testKey)),
  );
  const known = (loc) => !!loc && members.has(testKey(loc));
  const seen = new Set();
  const findings = [];
  for (const f of out.findings ?? []) {
    if (!known(f) || seen.has(testKey(f))) continue;
    if (f.verdict === "delete") {
      if (!known(f.coveredBy)) continue;
    } else if (f.verdict === "edit") {
      if (!f.suggestion) continue;
    } else continue;
    seen.add(testKey(f));
    findings.push({
      file: f.file,
      line: f.line,
      verdict: f.verdict,
      comment: f.comment ?? "",
      suggestion: f.verdict === "edit" ? f.suggestion : "",
      coveredBy: f.verdict === "delete" ? f.coveredBy : null,
      fold: f.verdict === "delete" ? !!f.fold : false,
      absorbs: f.verdict === "edit" ? (f.absorbs ?? []).filter(known) : [],
    });
  }
  return findings;
};

const reviewed = new Set(clusters.flatMap((cl) => cl.tests.map(testKey))).size;
const skipped = rawClusters
  .filter((c) => !c.ok)
  .map((c) => ({ symbol: c.code?.symbol, error: c.error }));
const empty = {
  findings: [],
  chunks: [],
  counts: {
    reviewed,
    flagged: 0,
    deletes: 0,
    edits: 0,
    candidates: 0,
    chunks: 0,
  },
  unscannable: evidence.unscannable ?? [],
  truncated: evidence.truncated ?? null,
  skipped,
};

if (!clusters.length || !rules.length) {
  log("no clusters to review");
  return empty;
}

log(
  `${reviewed} tests across ${clusters.length} clusters x ${rules.length} rules`,
);

// Barrier: the chunker unions across every judge's flags, so all judging must
// finish before a single cluster is chunked.
phase("Judge");
const pairs = rules.flatMap((rule) =>
  clusters.map((cluster) => ({ rule, cluster })),
);
const flagLists = await parallel(
  pairs.map((p) => () => judge(p.rule, p.cluster)),
);
const candidates = flagLists.filter(Boolean).flat();

const chunks = chunkClusters(clusters, candidates);
if (!chunks.length) {
  log(`${candidates.length} flags, no chunk survived; nothing to review`);
  return {
    ...empty,
    counts: { ...empty.counts, candidates: candidates.length },
  };
}

phase("Review");
const findingLists = await parallel(chunks.map((chunk) => () => review(chunk)));
const findings = findingLists
  .filter(Boolean)
  .flat()
  .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

const deletes = findings.filter((f) => f.verdict === "delete").length;
const edits = findings.filter((f) => f.verdict === "edit").length;
const counts = {
  reviewed,
  flagged: deletes + edits,
  deletes,
  edits,
  candidates: candidates.length,
  chunks: chunks.length,
};
log(
  `${candidates.length} flagged, ${chunks.length} chunks, ${findings.length} findings (${deletes} delete, ${edits} edit)`,
);

return {
  findings,
  chunks,
  counts,
  unscannable: evidence.unscannable ?? [],
  truncated: evidence.truncated ?? null,
  skipped,
};
