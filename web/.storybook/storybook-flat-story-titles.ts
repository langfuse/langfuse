import type { StorybookConfig } from "@storybook/nextjs-vite";
import { storyNameFromExport, toId } from "storybook/internal/csf";
import type { Plugin } from "vite";
import { basename } from "path";
import * as ts from "typescript";

const STORY_FILE_PATTERN = /\.stories\.[cm]?[jt]sx?$/;

function addFlatStoryTitle(code: string, fileName: string) {
  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );

  let metaObject: ts.ObjectLiteralExpression | undefined;

  const visit = (node: ts.Node) => {
    if (metaObject) return;

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "meta" &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const candidate = node.arguments[0];
      const hasTitle = candidate.properties.some(
        (property) =>
          (ts.isPropertyAssignment(property) ||
            ts.isShorthandPropertyAssignment(property)) &&
          (ts.isIdentifier(property.name) ||
            ts.isStringLiteral(property.name)) &&
          property.name.text === "title",
      );

      if (!hasTitle) metaObject = candidate;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (!metaObject) return null;

  const componentTitle = basename(fileName).replace(STORY_FILE_PATTERN, "");
  const insertionPoint = metaObject.getStart(sourceFile) + 1;

  return `${code.slice(0, insertionPoint)}\n  title: ${JSON.stringify(componentTitle)},${code.slice(insertionPoint)}`;
}

// Storybook computes index and runtime titles separately. Keep both paths in
// this module so inferred titles and their derived story IDs cannot diverge.
export const flattenStoryIndexTitles: NonNullable<
  StorybookConfig["experimental_indexers"]
> = async (indexers) =>
  indexers?.map((indexer) => ({
    ...indexer,
    createIndex: async (fileName, options) => {
      const entries = await indexer.createIndex(fileName, options);
      if (!STORY_FILE_PATTERN.test(fileName)) return entries;

      return entries.map((entry) => {
        const componentTitle = entry.title?.split("/").at(-1);
        if (!componentTitle) return entry;

        const title = options.makeTitle(componentTitle);
        const storyName = storyNameFromExport(entry.exportName);
        const derivedId = entry.title
          ? toId(entry.title, storyName)
          : undefined;

        return {
          ...entry,
          title,
          __id: entry.__id === derivedId ? toId(title, storyName) : entry.__id,
        };
      });
    },
  }));

export const flatStoryTitlesPlugin = {
  name: "storybook-flat-story-titles",
  enforce: "pre",
  transform(code, id) {
    const [fileName] = id.split("?");
    if (!fileName || !STORY_FILE_PATTERN.test(fileName)) return null;

    return addFlatStoryTitle(code, fileName);
  },
} satisfies Plugin;
