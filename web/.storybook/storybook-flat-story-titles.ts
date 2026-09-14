import type { StorybookConfig } from "@storybook/nextjs-vite";
import { storyNameFromExport, toId } from "storybook/internal/csf";
import type { Plugin } from "vite";
import { readFile } from "node:fs/promises";
import { basename } from "path";
import * as ts from "@typescript/typescript6";

const STORY_FILE_PATTERN = /\.stories\.[cm]?[jt]sx?$/;

/**
 * A story directory that gets its own sidebar section instead of the flat
 * default. Declared once in main.ts next to `stories`; it cannot be a `stories`
 * entry with a `titlePrefix`, because the flat-title plugin below writes an
 * explicit `title` into every story's meta and an explicit title beats the
 * specifier's prefix.
 */
export type StoryTitleGroup = {
  directory: string;
  titlePrefix: string;
};

// Storybook hands the indexer absolute OS paths while Vite ids are always
// POSIX, so normalize before matching and both paths agree on the same group.
function normalizePath(fileName: string) {
  return fileName.replaceAll("\\", "/");
}

function groupedStoryTitle(
  groups: readonly StoryTitleGroup[],
  fileName: string,
  componentTitle: string,
) {
  const normalizedFileName = `/${normalizePath(fileName).replace(/^\/+/, "")}`;

  for (const group of groups) {
    const directory = normalizePath(group.directory).replace(/^\/+|\/+$/g, "");
    const directoryMarker = `/${directory}/`;
    const directoryIndex = normalizedFileName.indexOf(directoryMarker);
    if (directoryIndex === -1) continue;

    const relativeFileName = normalizedFileName.slice(
      directoryIndex + directoryMarker.length,
    );
    const componentPath = relativeFileName
      .split("/")
      .slice(0, -1)
      .filter((segment) => segment !== "components");

    if (componentPath.at(-1) !== componentTitle) {
      componentPath.push(componentTitle);
    }

    return [group.titlePrefix, ...componentPath].join("/");
  }

  return undefined;
}

export function flatStoryTitle(
  fileName: string,
  groups: readonly StoryTitleGroup[] = [],
) {
  const componentTitle = basename(normalizePath(fileName)).replace(
    STORY_FILE_PATTERN,
    "",
  );
  return groupedStoryTitle(groups, fileName, componentTitle) ?? componentTitle;
}

function findMetaObject(code: string, fileName: string) {
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
      metaObject = node.arguments[0];
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return metaObject;
}

function hasTitleProperty(metaObject: ts.ObjectLiteralExpression) {
  return metaObject.properties.some(
    (property) =>
      (ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property)) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === "title",
  );
}

export function assertNoExplicitStoryTitle(code: string, fileName: string) {
  const metaObject = findMetaObject(code, fileName);
  if (metaObject && hasTitleProperty(metaObject)) {
    throw new Error(
      `Explicit Storybook titles are not allowed in ${fileName}. Rename the story file to set its title.`,
    );
  }

  return metaObject;
}

function addFlatStoryTitle(
  code: string,
  fileName: string,
  groups: readonly StoryTitleGroup[],
) {
  const metaObject = assertNoExplicitStoryTitle(code, fileName);
  if (!metaObject) return null;

  const componentTitle = flatStoryTitle(fileName, groups);
  const insertionPoint = metaObject.getStart() + 1;

  return `${code.slice(0, insertionPoint)}\n  title: ${JSON.stringify(componentTitle)},${code.slice(insertionPoint)}`;
}

// Storybook computes index and runtime titles separately. Keep both paths in
// this module so inferred titles and their derived story IDs cannot diverge.
export function flattenStoryIndexTitles(
  groups: readonly StoryTitleGroup[] = [],
): NonNullable<StorybookConfig["experimental_indexers"]> {
  return async (indexers) =>
    indexers?.map((indexer) => ({
      ...indexer,
      createIndex: async (fileName, options) => {
        if (!STORY_FILE_PATTERN.test(fileName)) {
          return indexer.createIndex(fileName, options);
        }

        assertNoExplicitStoryTitle(await readFile(fileName, "utf8"), fileName);
        const entries = await indexer.createIndex(fileName, options);

        return entries.map((entry) => {
          const componentTitle = entry.title?.split("/").at(-1);
          if (!componentTitle) return entry;

          const title =
            groupedStoryTitle(groups, fileName, componentTitle) ??
            options.makeTitle(componentTitle);
          const storyName = storyNameFromExport(entry.exportName);
          const derivedId = entry.title
            ? toId(entry.title, storyName)
            : undefined;

          return {
            ...entry,
            title,
            __id:
              entry.__id === derivedId ? toId(title, storyName) : entry.__id,
          };
        });
      },
    }));
}

export function flatStoryTitlesPlugin(groups: readonly StoryTitleGroup[] = []) {
  return {
    name: "storybook-flat-story-titles",
    enforce: "pre",
    transform(code, id) {
      const [fileName] = id.split("?");
      if (!fileName || !STORY_FILE_PATTERN.test(fileName)) return null;

      return addFlatStoryTitle(code, fileName, groups);
    },
  } satisfies Plugin;
}
