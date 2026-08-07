import { createHash } from "crypto";

/**
 * Trajectory signatures: reducing an agent run to the shape of its execution.
 *
 * A trace is a tree of observations. For a multi-agent pipeline the *shape* of
 * that tree - which agents ran, which tools they called, in what order, how
 * many times - is a much stronger behavioural signal than any single field on
 * it. Two runs over completely different documents that took the same path
 * through the system produce an identical signature; a run that skipped a
 * check, looped, or called something it has never called before does not.
 *
 * This module is deliberately pure. It takes nodes in, returns features out,
 * touches no database and no clock, so the thresholds built on top of it can
 * be unit-tested against hand-written trees.
 *
 * Node identity is `TYPE:name`, not name alone. Langfuse v4 records the
 * observation type (AGENT, TOOL, GENERATION, ...) as a first-class column, so
 * an agent and a tool that happen to share a name stay distinguishable.
 */

export type TrajectoryNode = {
  id: string;
  parentId: string | null;
  /** Observation type, e.g. AGENT | TOOL | GENERATION | CHAIN | SPAN. */
  type: string;
  name: string;
  /** Used only for sibling ordering. */
  startTime: Date | string | number;
  /** Langfuse observation level; ERROR and WARNING are counted. */
  level?: string | null;
};

export type TrajectoryFeatures = {
  /** Stable 16-hex-char digest of `canonicalPath`. */
  signature: string;
  /** Human-readable canonical walk. Kept for explaining a drift verdict. */
  canonicalPath: string;
  /** Total observations in the trace. */
  stepCount: number;
  /** Deepest nesting level, root = 1. */
  depth: number;
  /** Largest number of direct children of any single node. */
  maxFanout: number;
  /** Longest run of consecutive identical sibling subtrees. */
  maxRepeat: number;
  /**
   * `TYPE:name` -> longest consecutive repeat run of that step. Only steps
   * that actually repeated appear; an absent step repeated once.
   */
  repeatsByStep: Record<string, number>;
  /** Sorted distinct `TYPE:name` steps present in the run. */
  steps: string[];
  /** Sorted distinct `parent>child` transitions present in the run. */
  edges: string[];
  /** Observations at level ERROR or WARNING. */
  errorCount: number;
};

/**
 * Key for the synthetic parent that all root observations hang from.
 *
 * Must not collide with a real observation id. Langfuse ids are hex/UUID
 * strings, so an underscore-delimited word cannot clash. (This was briefly a
 * NUL-prefixed string, which collided with nothing but made git classify the
 * whole file as binary and refuse to render its diff.)
 */
const ROOT = "__trajectory_root__";

export function stepToken(node: Pick<TrajectoryNode, "type" | "name">): string {
  return `${node.type.toUpperCase()}:${node.name}`;
}

function toMillis(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Collapse consecutive identical subtree strings into `subtree*N`.
 *
 * A tool retried six times must not read as six unrelated steps - it is one
 * step that repeated, and the repeat count is the interesting part. Collapsing
 * also keeps a retry storm from inflating the signature into a value that is
 * unique to that run and therefore useless for comparison.
 *
 * Repeat counts are attributed to the *step that repeated*, not just tracked
 * as a single maximum for the run. A tool retrying and an adjudicator looping
 * are different faults, and pooling them into one number lets a common
 * repeat-heavy failure mode hide a rarer one behind it.
 */
function collapse(
  kids: readonly TrajectoryNode[],
  rendered: Map<string, string>,
): { text: string; maxRepeat: number; repeats: Map<string, number> } {
  const out: string[] = [];
  const repeats = new Map<string, number>();
  let maxRepeat = 1;
  let i = 0;
  while (i < kids.length) {
    const part = rendered.get(kids[i]!.id) ?? "";
    let run = 1;
    while (
      i + run < kids.length &&
      (rendered.get(kids[i + run]!.id) ?? "") === part
    ) {
      run++;
    }
    out.push(run > 1 ? `${part}*${run}` : part);
    maxRepeat = Math.max(maxRepeat, run);
    if (run > 1) {
      const token = stepToken(kids[i]!);
      repeats.set(token, Math.max(repeats.get(token) ?? 1, run));
    }
    i += run;
  }
  return { text: out.join(","), maxRepeat, repeats };
}

/**
 * Reduce a trace's observation tree to a canonical path string and the
 * structural features derived from it.
 *
 * Nodes whose declared parent is missing from the input are promoted to roots,
 * so a partially-ingested trace still yields a usable signature rather than
 * silently dropping a subtree.
 */
export function extractTrajectory(
  nodes: readonly TrajectoryNode[],
): TrajectoryFeatures {
  if (nodes.length === 0) {
    return {
      signature: hashPath(""),
      canonicalPath: "",
      stepCount: 0,
      depth: 0,
      maxFanout: 0,
      maxRepeat: 0,
      repeatsByStep: {},
      steps: [],
      edges: [],
      errorCount: 0,
    };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, TrajectoryNode[]>();
  for (const node of nodes) {
    const parentKey =
      node.parentId && byId.has(node.parentId) ? node.parentId : ROOT;
    const bucket = childrenOf.get(parentKey);
    if (bucket) bucket.push(node);
    else childrenOf.set(parentKey, [node]);
  }

  for (const bucket of childrenOf.values()) {
    bucket.sort((a, b) => {
      const delta = toMillis(a.startTime) - toMillis(b.startTime);
      return delta !== 0 ? delta : a.id.localeCompare(b.id);
    });
  }

  const steps = new Set<string>();
  const edges = new Set<string>();
  let maxFanout = 0;
  let maxRepeat = 1;
  let depth = 0;
  let errorCount = 0;

  // Iterative post-order walk: agent traces can nest deeply enough that a
  // recursive walk is a real stack-overflow risk on pathological runs.
  const rendered = new Map<string, string>();
  const repeatsByStep = new Map<string, number>();
  type Frame = { key: string; node: TrajectoryNode | null; level: number };
  const stack: Frame[] = [{ key: ROOT, node: null, level: 0 }];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    const kids = childrenOf.get(frame.key) ?? [];

    if (!seen.has(frame.key)) {
      seen.add(frame.key);
      maxFanout = Math.max(maxFanout, kids.length);
      if (frame.node) {
        const token = stepToken(frame.node);
        steps.add(token);
        depth = Math.max(depth, frame.level);
        const level = (frame.node.level ?? "").toUpperCase();
        if (level === "ERROR" || level === "WARNING") errorCount++;
        for (const kid of kids) edges.add(`${token}>${stepToken(kid)}`);
      }
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({
          key: kids[i]!.id,
          node: kids[i]!,
          level: frame.level + 1,
        });
      }
      continue;
    }

    stack.pop();
    const childText = collapse(kids, rendered);
    maxRepeat = Math.max(maxRepeat, childText.maxRepeat);
    for (const [token, run] of childText.repeats) {
      repeatsByStep.set(token, Math.max(repeatsByStep.get(token) ?? 1, run));
    }
    const body = kids.length > 0 ? `(${childText.text})` : "";
    rendered.set(
      frame.key,
      frame.node ? `${stepToken(frame.node)}${body}` : childText.text,
    );
  }

  const canonicalPath = rendered.get(ROOT) ?? "";

  return {
    signature: hashPath(canonicalPath),
    canonicalPath,
    stepCount: nodes.length,
    depth,
    maxFanout,
    maxRepeat,
    repeatsByStep: Object.fromEntries([...repeatsByStep].sort()),
    steps: [...steps].sort(),
    edges: [...edges].sort(),
    errorCount,
  };
}

export function hashPath(canonicalPath: string): string {
  return createHash("sha256").update(canonicalPath).digest("hex").slice(0, 16);
}
