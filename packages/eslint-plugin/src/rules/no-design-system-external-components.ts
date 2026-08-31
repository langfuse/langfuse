import path from "node:path";

import { getStaticStringValue } from "../rule-helpers/ast.js";
import { createRule } from "../util.js";

type MessageIds = "unexpected";

const ALIAS_PREFIXES = ["@/"] as const;

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isDesignSystemFile(filename: string): boolean {
  return /(?:^|\/)src\/components\/design-system(?:\/|$)/.test(
    toPosixPath(filename),
  );
}

function extractSrcPath(value: string): string | null {
  const normalized = toPosixPath(value).replace(/^\.\//, "");
  const srcIndex = normalized.indexOf("src/");
  if (srcIndex === -1) return null;
  if (srcIndex > 0 && normalized[srcIndex - 1] !== "/") return null;
  return `/${normalized.slice(srcIndex)}`;
}

function resolveSpecifier(filename: string, specifier: string): string | null {
  const normalizedSpecifier = toPosixPath(specifier);

  for (const prefix of ALIAS_PREFIXES) {
    if (normalizedSpecifier.startsWith(prefix)) {
      return extractSrcPath(normalizedSpecifier.slice(prefix.length));
    }
  }

  if (
    normalizedSpecifier.startsWith("./") ||
    normalizedSpecifier.startsWith("../")
  ) {
    const filePath = toPosixPath(filename);
    const directory = filePath.slice(0, filePath.lastIndexOf("/") + 1);
    return extractSrcPath(
      path.posix.normalize(`${directory}${normalizedSpecifier}`),
    );
  }

  return null;
}

function isForbiddenSrcPath(srcPath: string): boolean {
  if (
    srcPath === "/src/components/design-system" ||
    srcPath.startsWith("/src/components/design-system/")
  ) {
    return false;
  }

  return (
    srcPath === "/src/components" ||
    srcPath.startsWith("/src/components/") ||
    srcPath === "/src/features" ||
    srcPath.startsWith("/src/features/")
  );
}

const rule = createRule<[], MessageIds>({
  name: "no-design-system-external-components",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow design-system files from importing the outer `src/components` tree or `src/features`.",
    },
    schema: [],
    messages: {
      unexpected:
        "Design-system files must not import `{{importPath}}`. Keep the design system independent of the outer `src/components` tree and of `src/features`.",
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename;
    if (!isDesignSystemFile(filename)) {
      return {};
    }

    function checkSource(source: Parameters<typeof getStaticStringValue>[0]) {
      const specifier = getStaticStringValue(source);
      if (specifier === null) return;

      const resolved = resolveSpecifier(filename, specifier);
      if (resolved === null || !isForbiddenSrcPath(resolved)) return;

      context.report({
        node: source,
        messageId: "unexpected",
        data: { importPath: specifier },
      });
    }

    return {
      ImportDeclaration(node) {
        checkSource(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) checkSource(node.source);
      },
      ExportAllDeclaration(node) {
        checkSource(node.source);
      },
      ImportExpression(node) {
        checkSource(node.source);
      },
    };
  },
});

export default rule;
