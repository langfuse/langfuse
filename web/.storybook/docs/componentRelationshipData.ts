export type ComponentRelationshipGraph = {
  nodes: {
    id: string;
    label: string;
    kind: "component" | "function" | "internal";
    group: string | null;
  }[];
  edges: { id: string; source: string; target: string }[];
};

const DESIGN_SYSTEM_PATH = "/src/components/design-system/";
const DESIGN_SYSTEM_ALIAS = "@/src/components/design-system/";
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx)$/;
const NON_COMPONENT_FILE_PATTERN =
  /\.(?:stories|clienttest|servertest|test|spec)\.(?:ts|tsx)$/;
const STATIC_IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g;

function normalizePath(path: string) {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
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

function nodeGroup(path: string) {
  const area = path.split("/")[0];
  if (!area || /^[A-Z]/.test(area)) return null;
  return `${area.charAt(0).toUpperCase()}${area.slice(1)}`;
}

function nodeKind(path: string) {
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

  const nodeDetails = new Map(
    modules.map(({ id, kind, group }) => [id, { kind, group }]),
  );
  const nodeIds = new Set(nodeDetails.keys());
  const edgePairs = new Set<string>();

  for (const sourceModule of modules) {
    for (const match of sourceModule.source.matchAll(STATIC_IMPORT_PATTERN)) {
      const importedPath = resolveImport(sourceModule.path, match[1]);
      if (importedPath === null) continue;
      const target = componentId(importedPath);
      if (target === null || target === sourceModule.id || !nodeIds.has(target))
        continue;
      edgePairs.add(JSON.stringify([sourceModule.id, target]));
    }
  }

  const nodes = [...nodeIds]
    .sort((left, right) => left.localeCompare(right))
    .map((id) => ({
      id,
      label: id,
      kind: nodeDetails.get(id)?.kind ?? "component",
      group: nodeDetails.get(id)?.group ?? null,
    }));
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
