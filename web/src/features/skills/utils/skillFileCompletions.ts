import {
  acceptCompletion,
  autocompletion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@uiw/react-codemirror";

export function skillFileCompletions(
  currentPath: string,
  filePaths: string[],
): Extension {
  const directory = currentPath.split("/").slice(0, -1);
  const options = filePaths.map((path) => {
    const segments = path.split("/");
    let shared = 0;
    while (
      shared < directory.length &&
      directory[shared] === segments[shared]
    ) {
      shared += 1;
    }
    const relative = [
      ...directory.slice(shared).map(() => ".."),
      ...segments.slice(shared),
    ];
    return {
      label: relative.join("/"),
      type: "text",
      apply: relative
        .map((segment) =>
          encodeURIComponent(segment).replace(
            /[!'()*]/g,
            (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
          ),
        )
        .join("/"),
    };
  });

  const source: CompletionSource = (context) => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const match = /\[[^\]\n]*\]\(\s*<?([^\s<>)]*)$/.exec(before);
    if (
      !match ||
      isLiteralMarkdown(
        context.state.doc.sliceString(0, line.from),
        before.slice(0, match.index),
      )
    ) {
      return null;
    }
    const typed = match[1]!;
    if (/^(?:[a-z][a-z\d+.-]*:|[/?#])/i.test(typed) || /[?#]/.test(typed))
      return null;
    let prefix: string;
    try {
      prefix = decodeURIComponent(typed).replace(/^\.\//, "").toLowerCase();
    } catch {
      return null;
    }
    // Replace the remaining path when completing in the middle of a link,
    // retaining its fragment, title, and closing delimiters.
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

  return [
    autocompletion({ override: [source] }),
    Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
  ];
}

// This conservative scanner keeps file suggestions out of code examples and
// YAML without adding a Markdown language parser to the plain-text editor.
function isLiteralMarkdown(previousLines: string, beforeLink: string): boolean {
  if ((/\\+$/.exec(beforeLink)?.[0].length ?? 0) % 2 === 1) return true;
  let fence: { marker: string; length: number } | undefined;
  let frontmatter = false;
  const lines = previousLines.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (index === 0 && line.trim() === "---") {
      frontmatter = true;
      continue;
    }
    if (frontmatter) {
      if (/^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
      continue;
    }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!marker) continue;
    if (!fence) {
      fence = { marker: marker[1]![0]!, length: marker[1]!.length };
    } else if (
      marker[1]![0] === fence.marker &&
      marker[1]!.length >= fence.length &&
      marker[2]!.trim() === ""
    ) {
      fence = undefined;
    }
  }
  if (frontmatter || fence || /^(?: {4}|\t)/.test(beforeLink)) return true;
  let inlineCode = 0;
  for (const match of beforeLink.matchAll(/\\.|`+/g)) {
    if (match[0].startsWith("\\")) continue;
    if (!inlineCode) inlineCode = match[0].length;
    else if (inlineCode === match[0].length) inlineCode = 0;
  }
  return inlineCode > 0;
}
