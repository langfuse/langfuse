import type { CodeblockLanguage } from "@/src/components/design-system/Codeblock/Codeblock";

// Prism's bundled grammars and aliases, plus shell labels used by existing callers.
const supportedLanguages = [
  "plain",
  "plaintext",
  "text",
  "txt",
  "markup",
  "html",
  "mathml",
  "svg",
  "xml",
  "ssml",
  "atom",
  "rss",
  "regex",
  "clike",
  "javascript",
  "js",
  "actionscript",
  "coffeescript",
  "coffee",
  "javadoclike",
  "css",
  "yaml",
  "yml",
  "markdown",
  "md",
  "graphql",
  "sql",
  "typescript",
  "ts",
  "jsdoc",
  "flow",
  "n4js",
  "n4jsd",
  "jsx",
  "tsx",
  "swift",
  "kotlin",
  "kt",
  "kts",
  "c",
  "objectivec",
  "objc",
  "reason",
  "rust",
  "go",
  "cpp",
  "python",
  "py",
  "json",
  "webmanifest",
  "bash",
  "shell",
] as const satisfies readonly CodeblockLanguage[];

export function normalizeCodeblockLanguage(
  language: string,
): CodeblockLanguage {
  return (
    supportedLanguages.find(
      (supported) => supported === language.toLowerCase(),
    ) ?? "text"
  );
}
