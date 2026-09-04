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
/** @typedef {{ path: string, score: number, count: number, byRule: Map<number, number>, headline: string, samples: string[] }} WorkItem */

// Relative importance per rule; unlisted rules weigh 1. Runtime hazards and
// test-boundary breaches outrank naming and placement nits.
/** @type {Record<number, number>} */
export const RULE_WEIGHTS = { 7: 2, 10: 3, 11: 3, 19: 3 };

// What each rule means, for humans reading the breakdown.
/** @type {Record<number, string>} */
export const RULE_LABELS = {
  1: "one component per file, filename = component",
  2: "a component file exports only the component and its types",
  3: "hooks/fns/stores/contexts are camelCase, named after their export",
  4: "one function per file in fns/, no dump files",
  5: "kind folders are a closed list: components|hooks|contexts|stores|fns|server",
  6: "a file used by one feature lives in that feature",
  7: "no importing another component's internals",
  8: "features import other features only through their index.ts",
  9: "index.ts only at feature roots, named re-exports only",
  10: "client code does not import from server/ (types excepted)",
  11: "no runtime import cycles",
  12: "a src/pages file just mounts a feature's Page component",
  16: "ESLint ignores at file level only",
  18: "fn/hook tests sit flat next to their file",
  19: "only tests import from __tests__",
  20: "if nothing imports it, it isn't exported",
};

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

// The item's action headline: what the one small PR does.
/** @type {(ruleId: number, items: Attributed[], path: string) => string} */
function headlineFor(ruleId, items, path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  switch (ruleId) {
    case 1:
      return `Split up ${path} — one component per file, filename to match`;
    case 2:
      return `Evict the extra exports from ${path} (component + types only)`;
    case 3:
      return `Fix the naming in ${path} — camelCase, file named after its export`;
    case 4:
      return `Break ${path} into one-function files`;
    case 5:
      return `Fold ${path} into the kind folders`;
    case 6: {
      const dests = new Set(items.map((a) => a.viol.paths[1]));
      return dests.size === 1
        ? `Move ${path} home → ${[...dests][0]} (its only consumer)`
        : `Send the files in ${path} home — each has exactly one consumer`;
    }
    case 7:
      return `Stop reaching into ${name}'s internals — import its root, or promote the shared bits to siblings`;
    case 8:
      return `Give ${name} a front door — create index.ts and route the deep imports through it`;
    case 9:
      return `Relocate ${path} — index.ts only lives at feature roots`;
    case 10:
      return `Cut the client→server imports of ${path} (\`import type\`, or move it under server/)`;
    case 11:
      return `Break the runtime import cycle through ${name}`;
    case 12:
      return `Put ${path.replace(/^src\/pages/, "")} on a diet — thin shim here, the body moves to its feature`;
    case 16:
      return `Lift ${name}'s line-level eslint-disables to file level (or fix the code)`;
    case 18:
      return `Reunite the tests in ${path} with their subjects`;
    case 19:
      return `Move the test support in ${path} into __tests__`;
    case 20:
      return `Delete (or unexport) ${path} — nothing imports it`;
    default:
      return `Fix ${path}`;
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
      headline: headlineFor(dominantRule, dominantLive, best.node),
      samples: dominantLive.slice(0, 2).map((a) => a.viol.key),
    });
    for (const a of best.s.live) a.consumed = true;
  }
  return items;
}
