export function findClosingMarkdownLinkDestination(
  markdown: string,
  start: number,
) {
  let depth = 1;

  for (let index = start; index < markdown.length; index++) {
    const character = markdown[index];

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character !== ")") {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return index;
    }
  }

  return -1;
}
