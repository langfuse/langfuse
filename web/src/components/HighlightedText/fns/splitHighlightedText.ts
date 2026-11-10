export function splitHighlightedText(text: string, query: string) {
  if (!query) return [{ text, isMatch: false }];

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  // Case folding can expand characters; slices must use original UTF-16 offsets.
  const offsets: { start: number; end: number }[] = [];
  if (normalizedText.length !== text.length) {
    let offset = 0;
    for (const character of text) {
      const end = offset + character.length;
      for (let index = 0; index < character.toLowerCase().length; index++) {
        offsets.push({ start: offset, end });
      }
      offset = end;
    }
  }
  const parts: { text: string; isMatch: boolean }[] = [];
  let position = 0;
  let matchIndex = normalizedText.indexOf(normalizedQuery);

  while (matchIndex !== -1) {
    const start = offsets[matchIndex]?.start ?? matchIndex;
    const normalizedEnd = matchIndex + normalizedQuery.length;
    const end = offsets[normalizedEnd - 1]?.end ?? normalizedEnd;
    if (start < position) {
      matchIndex = normalizedText.indexOf(normalizedQuery, normalizedEnd);
      continue;
    }
    parts.push({ text: text.slice(position, start), isMatch: false });
    parts.push({ text: text.slice(start, end), isMatch: true });
    position = end;
    matchIndex = normalizedText.indexOf(normalizedQuery, normalizedEnd);
  }

  parts.push({ text: text.slice(position), isMatch: false });
  return parts;
}
