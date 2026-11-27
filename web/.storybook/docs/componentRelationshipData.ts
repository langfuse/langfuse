export type ComponentRelationshipGraph = {
  nodes: {
    id: string;
    label: string;
    kind: "component" | "function" | "internal" | "constants";
    group: string | null;
    paths: string[];
  }[];
  edges: { id: string; source: string; target: string }[];
};

export type RelationshipFocus = "both" | "dependencies" | "dependents";

export function focusComponentRelationshipGraph(
  graph: ComponentRelationshipGraph,
  nodeId: string,
  direction: RelationshipFocus,
): ComponentRelationshipGraph {
  const visibleNodes = new Set([nodeId]);
  const visibleEdges = new Set<string>();

  for (const endpoint of ["source", "target"] as const) {
    if (endpoint === "source" && direction === "dependents") continue;
    if (endpoint === "target" && direction === "dependencies") continue;

    const visited = new Set([nodeId]);
    const pending = [nodeId];
    for (const current of pending) {
      for (const edge of graph.edges) {
        if (edge[endpoint] !== current) continue;
        visibleEdges.add(edge.id);
        const next = endpoint === "source" ? edge.target : edge.source;
        if (visited.has(next)) continue;
        visited.add(next);
        visibleNodes.add(next);
        pending.push(next);
      }
    }
  }

  return {
    nodes: graph.nodes.filter((node) => visibleNodes.has(node.id)),
    edges: graph.edges.filter((edge) => visibleEdges.has(edge.id)),
  };
}

const DESIGN_SYSTEM_PATH = "/src/components/design-system/";
const DESIGN_SYSTEM_ALIAS = "@/src/components/design-system/";
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx)$/;
const NON_COMPONENT_FILE_PATTERN =
  /\.(?:stories|clienttest|servertest|test|spec)\.(?:ts|tsx)$/;
const STATIC_IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g;

function normalizePath(path: string) {
  const segments: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function relativeDesignSystemPath(path: string) {
  const normalized = `/${normalizePath(path)}`;
  const markerIndex = normalized.indexOf(DESIGN_SYSTEM_PATH);
  if (markerIndex === -1) return null;
  return normalized.slice(markerIndex + DESIGN_SYSTEM_PATH.length);
}

function componentId(path: string) {
  const [area, ...segments] = path.split("/");
  if (!area) return null;
  if (/^[A-Z]/.test(area)) return area;
  const group = `${area.charAt(0).toUpperCase()}${area.slice(1)}`;
  const subject =
    segments.find((segment) => /^[A-Z]/.test(segment)) ?? segments.at(-1);
  if (!subject) return group;
  return `${group} / ${subject.replace(SOURCE_FILE_PATTERN, "")}`;
}

export const COMPONENT_RELATIONSHIP_STORY_TAG = "component-relationships";
export const COMPONENT_RELATIONSHIP_QUERY = "relationshipComponent";

export function componentIdForDesignSystemStory(path: string) {
  const relativePath = relativeDesignSystemPath(path);
  if (!relativePath || !/\.stories\.[cm]?[jt]sx?$/.test(relativePath)) {
    return null;
  }
  return componentId(relativePath.replace(/\.stories\.[cm]?[jt]sx?$/, ".tsx"));
}

function nodeGroup(path: string) {
  const area = path.split("/")[0];
  if (!area || /^[A-Z]/.test(area)) return null;
  return `${area.charAt(0).toUpperCase()}${area.slice(1)}`;
}

function nodeKind(path: string) {
  if (path.endsWith("/constants.ts")) return "constants" as const;
  if (path.startsWith("internal/")) return "internal" as const;
  if (path.startsWith("factories/") || path.startsWith("table/columns/")) {
    return "function" as const;
  }
  return "component" as const;
}

function resolveImport(importer: string, specifier: string) {
  if (specifier.startsWith(DESIGN_SYSTEM_ALIAS)) {
    return specifier.slice(DESIGN_SYSTEM_ALIAS.length);
  }
  if (!specifier.startsWith(".")) return null;
  const segments = importer.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

export function buildComponentRelationshipGraph(
  sourceModules: Record<string, string>,
): ComponentRelationshipGraph {
  const modules = Object.entries(sourceModules).flatMap(([path, source]) => {
    const relativePath = relativeDesignSystemPath(path);
    if (
      relativePath === null ||
      !SOURCE_FILE_PATTERN.test(relativePath) ||
      NON_COMPONENT_FILE_PATTERN.test(relativePath)
    ) {
      return [];
    }
    const id = componentId(relativePath);
    return id === null
      ? []
      : [
          {
            id,
            group: nodeGroup(relativePath),
            kind: nodeKind(relativePath),
            path: relativePath,
            source,
          },
        ];
  });

  const nodeDetails = new Map<
    string,
    ComponentRelationshipGraph["nodes"][number]
  >();
  for (const { id, kind, group, path } of modules) {
    const existing = nodeDetails.get(id);
    if (existing) {
      existing.paths.push(path);
      continue;
    }
    nodeDetails.set(id, { id, label: id, kind, group, paths: [path] });
  }
  const edgePairs = new Set<string>();

  for (const sourceModule of modules) {
    for (const match of sourceModule.source.matchAll(STATIC_IMPORT_PATTERN)) {
      const importedPath = resolveImport(sourceModule.path, match[1]);
      if (importedPath === null) continue;
      const target = componentId(importedPath);
      if (
        target === null ||
        target === sourceModule.id ||
        !nodeDetails.has(target)
      ) {
        continue;
      }
      edgePairs.add(JSON.stringify([sourceModule.id, target]));
    }
  }

  const nodes = [...nodeDetails.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const edges = [...edgePairs]
    .map((pair) => JSON.parse(pair) as [string, string])
    .sort(([leftSource, leftTarget], [rightSource, rightTarget]) =>
      `${leftSource}\0${leftTarget}`.localeCompare(
        `${rightSource}\0${rightTarget}`,
      ),
    )
    .map(([source, target]) => ({
      id: `${source}->${target}`,
      source,
      target,
    }));

  return { nodes, edges };
}
