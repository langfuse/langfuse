import path from "node:path";
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

type Options = [
  {
    alias: string;
    directoryModuleRoots: readonly string[];
    fileModuleRoots: readonly string[];
  },
];

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
        required: ["alias", "directoryModuleRoots", "fileModuleRoots"],
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
        },
      },
    ],
  },
  defaultOptions: [
    { alias: "@", directoryModuleRoots: [], fileModuleRoots: [] },
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

      const sourceModule =
        getDirectoryModule(sourcePath) ?? getFileModule(sourcePath);
      const targetModule =
        getDirectoryModule(targetPath) ?? getFileModule(targetPath);
      const relativeTargetDirectory = path.posix.relative(
        sourceDirectory,
        path.posix.dirname(targetPath),
      );
      const directorySegments = relativeTargetDirectory
        .split("/")
        .filter(Boolean);
      const parentSegments = directorySegments.filter(
        (segment) => segment === "..",
      ).length;
      const childSegments = directorySegments.length - parentSegments;
      const isAdjacent = parentSegments <= 1 && childSegments <= 1;
      const isLocal =
        isAdjacent ||
        (sourceModule !== undefined && sourceModule === targetModule);

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
