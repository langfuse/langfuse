import path from "node:path";
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

type Options = [
  {
    alias: string;
    directoryModuleRoots: readonly string[];
    fileModuleRoots: readonly string[];
    importRoots: readonly string[];
  },
];

/**
 * Enforces canonical imports without losing useful locality.
 *
 * Import roots and modules serve different purposes:
 *
 * - Import roots define architectural boundaries. Imports crossing roots must
 *   use the configured alias, even when the files are physically adjacent.
 *   Patterns consist of literal path segments and `*`, which matches exactly
 *   one segment. When multiple patterns match, the most specific (longest)
 *   match wins. For example, `["*", "components/*", "features/*"]` makes
 *   every first-level source directory a root and promotes each direct child
 *   of `components` and `features` to its own root.
 * - Directory modules group everything below the first directory beneath a
 *   configured root, such as all files below `features/evals`.
 * - File modules group companion files by their base name, such as
 *   `Button.tsx`, `Button.test.tsx`, and `Button.stories.tsx`.
 *
 * Precedence:
 *
 * 1. Imports escaping the aliased source directory remain relative.
 * 2. Imports crossing import roots are absolute.
 * 3. Within one import root, imports with at most one leading `..` are
 *    relative regardless of how deeply they descend afterward.
 * 4. Deeper relative imports are allowed only within the same directory or
 *    file module; all other imports are absolute.
 *
 * Import-root matching normalizes a source filename to its companion base
 * name when a wildcard consumes that filename. This means a root pattern such
 * as `components/*` gives `components/Button.tsx` and
 * `components/Button.stories.tsx` the same `components/Button` root.
 */

const rule = createRule<Options, "useAbsolute" | "useRelative">({
  name: "consistent-relative-imports",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require relative imports within a module and absolute imports across modules.",
    },
    fixable: "code",
    messages: {
      useAbsolute:
        'Use the absolute import path "{{ importPath }}" across modules.',
      useRelative:
        'Use the relative import path "{{ importPath }}" within a module.',
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        required: [
          "alias",
          "directoryModuleRoots",
          "fileModuleRoots",
          "importRoots",
        ],
        properties: {
          alias: { type: "string", minLength: 1 },
          directoryModuleRoots: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
          fileModuleRoots: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
          importRoots: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
        },
      },
    ],
  },
  defaultOptions: [
    {
      alias: "@",
      directoryModuleRoots: [],
      fileModuleRoots: [],
      importRoots: [],
    },
  ],
  create(context, [options]) {
    const alias = options.alias;
    const sourceRoot = alias.split("/").at(-1)!;
    const normalizedFilename = context.filename.replaceAll(path.sep, "/");
    const sourceRootMarker = `/${sourceRoot}/`;
    const sourceRootIndex = normalizedFilename.lastIndexOf(sourceRootMarker);

    if (sourceRootIndex === -1) return {};

    const sourcePath = normalizedFilename.slice(
      sourceRootIndex + sourceRootMarker.length,
    );
    const sourceDirectory = path.posix.dirname(sourcePath);
    const importRootPatterns = options.importRoots
      .map((pattern) => pattern.split("/"))
      .sort((left, right) => right.length - left.length);

    function getDirectoryModule(filePath: string) {
      for (const moduleRoot of options.directoryModuleRoots) {
        if (!filePath.startsWith(`${moduleRoot}/`)) continue;

        const moduleName = filePath.slice(moduleRoot.length + 1).split("/")[0];
        return `${moduleRoot}/${moduleName}`;
      }

      return undefined;
    }

    function getFileModule(filePath: string) {
      for (const moduleRoot of options.fileModuleRoots) {
        if (!filePath.startsWith(`${moduleRoot}/`)) continue;

        const directory = path.posix.dirname(filePath);
        const filename = path.posix.basename(filePath);
        const componentName = filename.split(".")[0];
        return `${directory}/${componentName}`;
      }

      return undefined;
    }

    function getImportRoot(filePath: string, isSource: boolean) {
      const pathSegments = filePath.split("/");

      for (const patternSegments of importRootPatterns) {
        if (patternSegments.length > pathSegments.length) continue;

        const matches = patternSegments.every(
          (segment, index) =>
            segment === "*" || segment === pathSegments[index],
        );
        if (!matches) continue;

        const rootSegments = pathSegments.slice(0, patternSegments.length);
        if (isSource && patternSegments.length === pathSegments.length) {
          const filename = rootSegments.at(-1)!;
          rootSegments[rootSegments.length - 1] = filename.split(".")[0];
        }

        return rootSegments.join("/");
      }

      return undefined;
    }

    const sourceModule =
      getDirectoryModule(sourcePath) ?? getFileModule(sourcePath);
    const sourceImportRoot = getImportRoot(sourcePath, true);

    function checkSource(node: TSESTree.StringLiteral) {
      const importPath = node.value;
      const isRelative = importPath.startsWith(".");
      const isAbsolute =
        importPath === alias || importPath.startsWith(`${alias}/`);

      if (!isRelative && !isAbsolute) return;

      const targetPath = isRelative
        ? path.posix.normalize(path.posix.join(sourceDirectory, importPath))
        : importPath.slice(alias.length).replace(/^\//, "");
      if (targetPath === ".." || targetPath.startsWith("../")) {
        if (isRelative) return;

        const relativePath = path.posix.relative(sourceDirectory, targetPath);
        context.report({
          node,
          messageId: "useRelative",
          data: { importPath: relativePath },
          fix: (fixer) => fixer.replaceText(node, `"${relativePath}"`),
        });
        return;
      }

      const targetImportRoot = getImportRoot(targetPath, false);
      const crossesImportRoot = sourceImportRoot !== targetImportRoot;
      let isLocal = false;

      if (!crossesImportRoot) {
        const relativeTargetPath = path.posix.relative(
          sourceDirectory,
          targetPath,
        );
        const parentSegments = relativeTargetPath
          .split("/")
          .filter((segment) => segment === "..").length;
        const isAdjacent = parentSegments <= 1;

        if (isAdjacent) {
          isLocal = true;
        } else if (sourceModule !== undefined) {
          const targetModule =
            getDirectoryModule(targetPath) ?? getFileModule(targetPath);
          isLocal = sourceModule === targetModule;
        }
      }

      if (isAbsolute && isLocal) {
        let relativePath = path.posix.relative(sourceDirectory, targetPath);
        if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`;

        context.report({
          node,
          messageId: "useRelative",
          data: { importPath: relativePath },
          fix: (fixer) => fixer.replaceText(node, `"${relativePath}"`),
        });
        return;
      }

      if (isRelative && !isLocal) {
        const absolutePath = `${alias}/${targetPath}`;
        context.report({
          node,
          messageId: "useAbsolute",
          data: { importPath: absolutePath },
          fix: (fixer) => fixer.replaceText(node, `"${absolutePath}"`),
        });
      }
    }

    return {
      ImportDeclaration(node) {
        checkSource(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source?.type === AST_NODE_TYPES.Literal)
          checkSource(node.source);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source);
      },
    };
  },
});

export default rule;
