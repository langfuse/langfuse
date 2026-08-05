// "What to fix next": turns per-rule violations into ranked work items,
// each sized for one small PR.
//
// Every violation is attributed to the path where its fix lands (the subject).
// Subjects roll up their ancestor directories, so 41 single-file moves out of
// one folder surface as one "move the folder" item. Greedy set-cover then
// picks the highest-leverage node, consumes its violations, and rescores —
// leverage = violations cleared × per-rule weight.

/** @typedef {import("./detectors.mjs").Violation} Violation */
/** @typedef {{ ruleId: number, viol: Violation, weight: number, consumed: boolean }} Attributed */
/** @typedef {{ path: string, score: number, count: number, byRule: Map<number, number>, hint: string, samples: string[] }} WorkItem */

// Relative importance per rule; unlisted rules weigh 1. Runtime hazards and
// test-boundary breaches outrank naming and placement nits.
/** @type {Record<number, number>} */
export const RULE_WEIGHTS = { 7: 2, 10: 3, 11: 3, 19: 3 };

// Rule 13 is excluded: its census duplicates rule 6's move work, and a frozen
// folder's existing files aren't individually actionable.
const SKIP_RULES = new Set([13]);

// Rules whose subjects don't aggregate into directory items: thinning one
// page is a PR; "thin all 70 pages under project/" is not.
const NO_ROLLUP = new Set([12]);

// Too coarse to ever be one PR — never offered as items themselves.
const NON_CANDIDATES = new Set([
  "src",
  "src/ee",
  "src/features",
  "src/ee/features",
  "src/components",
  "src/pages",
  "src/app",
  "src/hooks",
  "src/contexts",
  "src/stores",
  "src/fns",
  "src/utils",
  "src/constants",
  "src/lib",
  "src/server",
]);

/** @type {(p: string) => string | null} */
const featureRoot = (p) => {
  const m = p.match(/^src\/(?:ee\/)?features\/[^/]+/);
  return m ? m[0] : null;
};

// Where the fix for a violation lands.
/** @type {(ruleId: number, viol: Violation) => string} */
function subjectOf(ruleId, viol) {
  if (ruleId === 7 && viol.paths[1]) return viol.paths[1]; // the reached-into internals
  if (ruleId === 8 && viol.paths[1])
    return featureRoot(viol.paths[1]) ?? viol.paths[1]; // the feature that needs an index.ts
  return viol.paths[0];
}

/** @type {(ruleId: number, items: Attributed[], path: string) => string} */
function hintFor(ruleId, items, path) {
  switch (ruleId) {
    case 1:
      return "one component per file; make the filename match it";
    case 2:
      return "move the non-component exports out";
    case 3:
      return "rename to camelCase / after the export";
    case 4:
      return "split into one-function files";
    case 5:
      return "fold into kind folders (components|hooks|contexts|stores|fns|server)";
    case 6: {
      const dests = new Set(items.map((a) => a.viol.paths[1]));
      return dests.size === 1
        ? `move into ${[...dests][0]} (its only consumer)`
        : "move each file into its only consumer";
    }
    case 7:
      return "cross the component boundary via its root file; promote shared internals to siblings";
    case 8:
      return `create ${path}/index.ts and route external importers through it`;
    case 9:
      return "index.ts only at feature roots — rename to the component / named re-exports only";
    case 10:
      return "make it `import type`, or move the server code under server/";
    case 11:
      return "break the runtime import cycle";
    case 12:
      return "extract the page body into its feature's Page component; leave a thin shim";
    case 16:
      return "lift the eslint-disable to file level (or fix the code)";
    case 18:
      return "colocate the test next to its subject (or move it into __tests__)";
    case 19:
      return "move test support into __tests__";
    case 20:
      return "nothing imports this — unexport or delete";
    default:
      return "";
  }
}

/**
 * @param {Map<number, Violation[]>} results per-rule violations (already scoped)
 * @param {number} topN
 * @returns {WorkItem[]}
 */
export function computeNextItems(results, topN) {
  /** @type {Map<string, Attributed[]>} subject path -> attributed violations */
  const bySubject = new Map();
  for (const [ruleId, viols] of results) {
    if (SKIP_RULES.has(ruleId)) continue;
    const weight = RULE_WEIGHTS[ruleId] ?? 1;
    for (const viol of viols) {
      const subj = subjectOf(ruleId, viol);
      const list = bySubject.get(subj) ?? [];
      list.push({ ruleId, viol, weight, consumed: false });
      bySubject.set(subj, list);
    }
  }

  // every subject + its ancestor dirs form the candidate tree
  /** @type {Map<string, string[]>} node -> subject paths at-or-below it */
  const nodeSubjects = new Map();
  for (const subj of bySubject.keys()) {
    const parts = subj.split("/");
    for (let i = 2; i <= parts.length; i++) {
      const node = parts.slice(0, i).join("/");
      const list = nodeSubjects.get(node) ?? [];
      list.push(subj);
      nodeSubjects.set(node, list);
    }
  }

  /** @typedef {{ score: number, count: number, byRule: Map<number, number>, byRuleWeighted: Map<number, number>, live: Attributed[] }} NodeScore */
  /** @type {(node: string) => NodeScore} */
  const scoreOf = (node) => {
    /** @type {Map<number, number>} */
    const byRule = new Map();
    /** @type {Map<number, number>} */
    const byRuleWeighted = new Map();
    /** @type {Attributed[]} */
    const live = [];
    let score = 0;
    for (const subj of nodeSubjects.get(node) ?? [])
      for (const a of bySubject.get(subj) ?? []) {
        if (a.consumed) continue;
        if (node !== subj && NO_ROLLUP.has(a.ruleId)) continue;
        score += a.weight;
        byRule.set(a.ruleId, (byRule.get(a.ruleId) ?? 0) + 1);
        byRuleWeighted.set(
          a.ruleId,
          (byRuleWeighted.get(a.ruleId) ?? 0) + a.weight,
        );
        live.push(a);
      }
    return { score, count: live.length, byRule, byRuleWeighted, live };
  };

  /** @type {(node: string) => NodeScore} own violations only, not the subtree */
  const ownScoreOf = (node) => {
    /** @type {Map<number, number>} */
    const byRule = new Map();
    /** @type {Map<number, number>} */
    const byRuleWeighted = new Map();
    /** @type {Attributed[]} */
    const live = [];
    let score = 0;
    for (const a of bySubject.get(node) ?? []) {
      if (a.consumed) continue;
      score += a.weight;
      byRule.set(a.ruleId, (byRule.get(a.ruleId) ?? 0) + 1);
      byRuleWeighted.set(
        a.ruleId,
        (byRuleWeighted.get(a.ruleId) ?? 0) + a.weight,
      );
      live.push(a);
    }
    return { score, count: live.length, byRule, byRuleWeighted, live };
  };

  // A node's candidate work item: the whole subtree when one rule dominates
  // it (a folder move, an index.ts, ...), otherwise only the node's own
  // violations — a mixed-rule subtree is not one PR.
  /** @type {(node: string) => NodeScore | null} */
  const candidateScore = (node) => {
    const s = scoreOf(node);
    if (s.score === 0) return null;
    const top = Math.max(0, ...s.byRuleWeighted.values());
    if (top >= s.score * 0.7) return s;
    if (bySubject.has(node)) {
      const own = ownScoreOf(node);
      return own.score > 0 ? own : null;
    }
    return null;
  };

  /** @type {WorkItem[]} */
  const items = [];
  while (items.length < topN) {
    /** @type {{ node: string, s: NodeScore } | null} */
    let best = null;
    for (const node of nodeSubjects.keys()) {
      if (NON_CANDIDATES.has(node)) continue;
      const s = candidateScore(node);
      if (!s) continue;
      if (
        !best ||
        s.score > best.s.score ||
        (s.score === best.s.score &&
          node.split("/").length > best.node.split("/").length)
      )
        best = { node, s };
    }
    if (!best) break;

    // prefer the deepest node that still captures nearly the whole win
    let descended = true;
    while (descended) {
      descended = false;
      for (const node of nodeSubjects.keys()) {
        if (node === best.node || !node.startsWith(best.node + "/")) continue;
        if (NON_CANDIDATES.has(node)) continue;
        const s = candidateScore(node);
        if (s && s.score >= best.s.score * 0.85) {
          best = { node, s };
          descended = true;
          break;
        }
      }
    }

    const dominantRule = [...best.s.byRuleWeighted.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0][0];
    const dominantLive = best.s.live.filter((a) => a.ruleId === dominantRule);
    items.push({
      path: best.node,
      score: best.s.score,
      count: best.s.count,
      byRule: best.s.byRule,
      hint: hintFor(dominantRule, dominantLive, best.node),
      samples: dominantLive.slice(0, 2).map((a) => a.viol.key),
    });
    for (const a of best.s.live) a.consumed = true;
  }
  return items;
}
