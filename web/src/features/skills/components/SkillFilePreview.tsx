import { isMap, parseDocument, stringify } from "yaml";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { normalizeCodeblockLanguage } from "@/src/utils/normalizeCodeblockLanguage";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";

export function SkillFilePreview({
  path,
  content,
}: {
  path: string;
  content: string;
}) {
  if (content.length === 0) {
    return <p className="text-muted-foreground text-sm">This file is empty.</p>;
  }

  const filename = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (/\.(md|markdown)$/i.test(filename)) {
    return (
      <Tabs defaultValue="preview">
        <div className="mb-3 flex justify-end">
          <Tabs.List aria-label="File display" variant="inset" size="sm">
            <Tabs.Trigger value="preview" label="Preview" />
            <Tabs.Trigger value="raw" label="Raw" />
          </Tabs.List>
        </div>
        <Tabs.Content value="preview">
          <MarkdownFilePreview filename={filename} content={content} />
        </Tabs.Content>
        <Tabs.Content value="raw">
          <Codeblock language="text" value={content} variant="read-only" />
        </Tabs.Content>
      </Tabs>
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
  filename,
  content,
}: {
  filename: string;
  content: string;
}) {
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
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-3">
      {parsed.kind === "parsed" ? (
        <section
          aria-label="Skill front matter"
          className="bg-muted/30 rounded-md border p-3"
        >
          <h2 className="mb-2 text-sm font-bold">Skill front matter</h2>
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
      <MarkdownView markdown={parsed.body} />
    </article>
  );
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
