// Groups the clusters a reviewer looks at together. A cluster is a production
// symbol plus the test blocks that reference it (gather's shape). Two clusters
// that a judge flagged and that share a member test block must be reviewed as
// one unit, so a delete whose surviving assertion belongs on a test another
// cluster also touches is reconciled by a single reviewer rather than split
// across two that cannot see each other's verdicts.
//
// Only clusters carrying at least one candidate participate; an unflagged
// cluster never bridges two flagged ones. Grouping is by union-find over the
// shared `(file, line)` of member tests. The result is deterministic: clusters
// sort by id within a chunk, candidates by file then line then rule, and chunks
// by their lowest cluster id.

const testKey = (t) => `${t.file}:::${t.line}`;

/**
 * @param {Array<{id: number, tests: Array<{file: string, line: number}>}>} clusters
 * @param {Array<{clusterId: number, rule: string, file: string, line: number}>} candidates
 * @returns {Array<{clusters: Array<object>, candidates: Array<object>}>}
 */
export function chunkClusters(clusters, candidates) {
  const byCluster = new Map();
  for (const candidate of candidates) {
    if (!byCluster.has(candidate.clusterId))
      byCluster.set(candidate.clusterId, []);
    byCluster.get(candidate.clusterId).push(candidate);
  }

  const participating = clusters.filter((cluster) => byCluster.has(cluster.id));

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
    const chunkClustersList = [...group].sort((a, b) => a.id - b.id);
    const chunkCandidates = chunkClustersList
      .flatMap((cluster) => byCluster.get(cluster.id) ?? [])
      .sort(
        (a, b) =>
          a.file.localeCompare(b.file) ||
          a.line - b.line ||
          a.rule.localeCompare(b.rule),
      );
    chunks.push({ clusters: chunkClustersList, candidates: chunkCandidates });
  }
  return chunks.sort((a, b) => a.clusters[0].id - b.clusters[0].id);
}
