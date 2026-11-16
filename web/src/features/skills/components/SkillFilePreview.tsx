import { type MouseEvent } from "react";
import { isMap, parseDocument, stringify } from "yaml";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { normalizeCodeblockLanguage } from "@/src/utils/normalizeCodeblockLanguage";
import { MarkdownView } from "@/src/components/ui/MarkdownView";

type SkillFileNavigation = {
  paths: string[];
  onSelect: (path: string) => void;
};

export function SkillFilePreview({
  path,
  content,
  format = "formatted",
  fileNavigation,
}: {
  path: string;
  content: string;
  format?: "formatted" | "raw";
  fileNavigation?: SkillFileNavigation;
}) {
  if (content.length === 0) {
    return <p className="text-muted-foreground text-sm">This file is empty.</p>;
  }

  const filename = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (/\.(md|markdown)$/i.test(filename)) {
    return format === "formatted" ? (
      <MarkdownFilePreview
        path={path}
        filename={filename}
        content={content}
        fileNavigation={fileNavigation}
      />
    ) : (
      <Codeblock language="text" value={content} variant="read-only" />
    );
  }

  const extension = filename.includes(".") ? filename.split(".").at(-1)! : "";
  const languageAliases: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    py: "python",
    sh: "bash",
    zsh: "bash",
    yml: "yaml",
    html: "markup",
    xml: "markup",
    svg: "markup",
    mdx: "text",
    txt: "text",
  };
  const languageName = languageAliases[extension] ?? (extension || "text");
  const language = normalizeCodeblockLanguage(languageName);
  return (
    <Codeblock
      language={
        language === "text"
          ? { value: language, label: languageName }
          : language
      }
      value={content}
    />
  );
}

function MarkdownFilePreview({
  path,
  filename,
  content,
  fileNavigation,
}: {
  path: string;
  filename: string;
  content: string;
  fileNavigation?: SkillFileNavigation;
}) {
  const handleFileLinkEvent = (event: MouseEvent<HTMLElement>) => {
    if (!fileNavigation || !(event.target instanceof Element)) return;
    if (event.type !== "contextmenu" && event.button > 1) return;
    const href = event.target.closest("a")?.getAttribute("href");
    // File-relative references stay in the editor, even when the destination
    // is missing or outside this skill. URLs and application routes are unchanged.
    if (!href || /^(?:[a-z][a-z\d+.-]*:|[/?#])/i.test(href)) return;
    event.preventDefault();
    if (event.type === "contextmenu") return;
    const targetPath = resolveSkillFileLink(path, href);
    if (targetPath && fileNavigation.paths.includes(targetPath)) {
      fileNavigation.onSelect(targetPath);
    }
  };
  const parsed: SkillDocument =
    filename === "skill.md"
      ? parseSkillDocument(content)
      : { kind: "markdown", body: content };
  if (parsed.kind === "invalid") {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-muted-foreground text-sm">
          Could not read the skill front matter. Showing the original source.
        </p>
        <Codeblock language="text" value={content} variant="read-only" />
      </div>
    );
  }

  return (
    <article
      className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-2"
      onClickCapture={handleFileLinkEvent}
      onAuxClickCapture={handleFileLinkEvent}
      onContextMenuCapture={handleFileLinkEvent}
    >
      {parsed.kind === "parsed" ? (
        <section
          aria-label="Skill front matter"
          className="bg-muted/30 rounded-md border p-3"
        >
          <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {parsed.fields.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground font-mono text-xs [overflow-wrap:anywhere]">
                  {key}
                </dt>
                <dd className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <MarkdownView
        markdown={parsed.body}
        className="min-w-0 [&_table]:w-full [&_table]:table-fixed [&_td]:align-top [&_td]:wrap-anywhere [&_td]:whitespace-normal [&_th]:align-top [&_th]:wrap-anywhere [&_th]:whitespace-normal"
      />
    </article>
  );
}

function resolveSkillFileLink(
  currentPath: string,
  href: string,
): string | null {
  let path: string;
  try {
    path = decodeURIComponent(href.split(/[?#]/, 1)[0]!);
  } catch {
    return null;
  }
  if (!path || path.startsWith("/") || path.includes("\\")) return null;
  const segments = currentPath.split("/").slice(0, -1);
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

type SkillDocument =
  | { kind: "markdown"; body: string }
  | { kind: "parsed"; body: string; fields: [string, string][] }
  | { kind: "invalid" };

function parseSkillDocument(content: string): SkillDocument {
  if (!/^---\r?\n/.test(content)) {
    return { kind: "markdown", body: content };
  }
  const match = /^---\r?\n([\s\S]*?)^---[\t ]*(?:\r?\n|$)/m.exec(content);
  if (!match) return { kind: "invalid" };

  try {
    const document = parseDocument(match[1] ?? "");
    if (document.errors.length > 0 || !isMap(document.contents)) {
      return { kind: "invalid" };
    }
    const metadata = document.toJS({ maxAliasCount: 0 }) as Record<
      string,
      unknown
    >;
    return {
      kind: "parsed",
      body: content.slice(match[0].length),
      fields: Object.entries(metadata).map(([key, value]) => [
        key,
        (typeof value === "string" ? value : stringify(value)).trimEnd(),
      ]),
    };
  } catch {
    return { kind: "invalid" };
  }
}
