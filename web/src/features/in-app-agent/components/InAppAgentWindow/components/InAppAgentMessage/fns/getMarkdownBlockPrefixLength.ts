export function getMarkdownBlockPrefixLength(markdown: string) {
  return (
    markdown.match(
      /^(?: {0,3}(?:#{1,6}[ \t]+|[-+*][ \t]+|\d{1,9}[.)][ \t]+|>[ \t]?))/,
    )?.[0].length ?? 0
  );
}
