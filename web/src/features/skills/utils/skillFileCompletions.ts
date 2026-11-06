import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { Prec, type Extension, type Text } from "@codemirror/state";
import { keymap } from "@uiw/react-codemirror";
import { fromMarkdown } from "mdast-util-from-markdown";

type MarkdownTree = ReturnType<typeof fromMarkdown>;
type MarkdownNode = MarkdownTree | MarkdownTree["children"][number];
type ParsedMarkdown = { tree: MarkdownTree; frontmatterEnd: number };

export function skillFileCompletions(
  currentPath: string,
  filePaths: string[],
): Extension {
  const directory = currentPath.split("/").slice(0, -1);
  const options = filePaths.map((path) =>
    toRelativeLinkOption(directory, path),
  );
  const source = linkCompletionSource(options);

  return [
    autocompletion({ override: [source] }),
    Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
  ];
}

function toRelativeLinkOption(directory: string[], path: string): Completion {
  const segments = path.split("/");
  let shared = 0;
  while (shared < directory.length && directory[shared] === segments[shared]) {
    shared += 1;
  }
  const relative = [
    ...directory.slice(shared).map(() => ".."),
    ...segments.slice(shared),
  ];
  return {
    label: relative.join("/"),
    type: "text",
    apply: relative.map(encodeLinkSegment).join("/"),
  };
}

function encodeLinkSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function linkCompletionSource(options: Completion[]): CompletionSource {
  const parsedDocuments = new WeakMap<Text, ParsedMarkdown>();
  return (context) => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const match = /\[[^\]\n]*\]\(\s*<?([^\s<>)]*)$/.exec(before);
    if (!match) return null;
    if ((/\\+$/.exec(before.slice(0, match.index))?.[0].length ?? 0) % 2 === 1)
      return null;
    const typed = match[1]!;
    const prefix = decodeLinkPrefix(typed);
    if (prefix === null) return null;
    const parsed = parseMarkdownDocument(context.state.doc, parsedDocuments);
    const linkStart = line.from + match.index;
    if (linkStart < parsed.frontmatterEnd || isCodeAt(parsed.tree, linkStart))
      return null;

    // Replace the remaining path while retaining its fragment and delimiters.
    const suffix = /^[^\s<> )?#]*/.exec(
      line.text.slice(context.pos - line.from),
    )![0];
    return {
      from: context.pos - typed.length,
      to: context.pos + suffix.length,
      filter: false,
      options: options.filter(({ label }) =>
        label.toLowerCase().includes(prefix),
      ),
    };
  };
}

function decodeLinkPrefix(typed: string): string | null {
  if (/^(?:[a-z][a-z\d+.-]*:|[/?#])/i.test(typed) || /[?#]/.test(typed))
    return null;
  try {
    return decodeURIComponent(typed).replace(/^\.\//, "").toLowerCase();
  } catch {
    return null;
  }
}

function parseMarkdownDocument(
  doc: Text,
  cache: WeakMap<Text, ParsedMarkdown>,
): ParsedMarkdown {
  const cached = cache.get(doc);
  if (cached) return cached;
  const content = doc.toString();
  const frontmatterEnd = getFrontmatterEnd(content);
  // Mask YAML without shifting offsets or interpreting its contents as Markdown.
  const markdown =
    content.slice(0, frontmatterEnd).replace(/[^\r\n]/g, " ") +
    content.slice(frontmatterEnd);
  const parsed = { tree: fromMarkdown(markdown), frontmatterEnd };
  cache.set(doc, parsed);
  return parsed;
}

function getFrontmatterEnd(content: string): number {
  const opening = /^---[\t ]*\r?\n/.exec(content);
  if (!opening) return 0;
  const closing = /^(?:---|\.\.\.)[\t ]*\r?$/m.exec(
    content.slice(opening[0].length),
  );
  if (!closing) return content.length;
  return opening[0].length + closing.index + closing[0].length;
}

function isCodeAt(node: MarkdownNode, offset: number): boolean {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (
    start === undefined ||
    end === undefined ||
    offset < start ||
    offset >= end
  )
    return false;
  if (node.type === "code" || node.type === "inlineCode") return true;
  return (
    "children" in node && node.children.some((child) => isCodeAt(child, offset))
  );
}
