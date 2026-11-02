export type SkillFileTreeNode =
  | {
      kind: "folder";
      name: string;
      path: string;
      children: SkillFileTreeNode[];
    }
  | { kind: "file"; name: string; path: string };

type MutableFolder = {
  kind: "folder";
  name: string;
  path: string;
  children: Map<string, MutableTreeNode>;
};

type MutableTreeNode =
  | MutableFolder
  | { kind: "file"; name: string; path: string };

export function getParentFolderPaths(filePaths: string[]): string[] {
  const folders = new Set<string>();
  for (const filePath of filePaths) {
    const segments = filePath.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      folders.add(segments.slice(0, index).join("/"));
    }
  }
  return [...folders].toSorted((left, right) => left.localeCompare(right));
}

export function buildSkillFileTree(
  filePaths: string[],
  folderPaths: string[],
): SkillFileTreeNode[] {
  const root: MutableFolder = {
    kind: "folder",
    name: "",
    path: "",
    children: new Map(),
  };

  for (const folderPath of [
    ...new Set([...folderPaths, ...getParentFolderPaths(filePaths)]),
  ].toSorted()) {
    ensureFolder(root, folderPath);
  }

  for (const filePath of filePaths) {
    const segments = filePath.split("/");
    const name = segments.pop()!;
    const parent = ensureFolder(root, segments.join("/"));
    parent.children.set(name, { kind: "file", name, path: filePath });
  }

  return serializeChildren(root.children);
}

function ensureFolder(root: MutableFolder, path: string): MutableFolder {
  if (!path) return root;

  let parent = root;
  let currentPath = "";
  for (const segment of path.split("/")) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const existing = parent.children.get(segment);
    if (existing?.kind === "folder") {
      parent = existing;
      continue;
    }

    const folder: MutableFolder = {
      kind: "folder",
      name: segment,
      path: currentPath,
      children: new Map(),
    };
    parent.children.set(segment, folder);
    parent = folder;
  }
  return parent;
}

function serializeChildren(
  children: Map<string, MutableTreeNode>,
): SkillFileTreeNode[] {
  return [...children.values()]
    .toSorted((left, right) => {
      if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
      return left.name.localeCompare(right.name);
    })
    .map((node) =>
      node.kind === "folder"
        ? { ...node, children: serializeChildren(node.children) }
        : node,
    );
}
