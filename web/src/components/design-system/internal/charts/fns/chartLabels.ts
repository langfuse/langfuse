const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const emoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u20e3]/u;

function segmentLabel(label: string): string[] {
  return graphemeSegmenter && /[^\x00-\x7f]/.test(label)
    ? Array.from(graphemeSegmenter.segment(label), ({ segment }) => segment)
    : Array.from(label);
}

// These charts estimate ordinary characters at 7 px with their 12 px font.
// Reserve 21 px for emoji clusters. They may use a wider fallback font.
function labelUnits(segment: string): number {
  return emoji.test(segment) ? 3 : 1;
}

export function chartLabelUnits(label: string): number {
  return segmentLabel(label).reduce(
    (units, segment) => units + labelUnits(segment),
    0,
  );
}

export function truncateChartLabelByCharacters(
  label: string,
  maxCharacters: number,
): string {
  if (maxCharacters < 1) return "";
  const characters = segmentLabel(label);
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters - 1).join("")}…`
    : label;
}

export function truncateChartLabelToFit(
  label: string,
  maxUnits: number,
): string {
  if (maxUnits < 1) return "";
  const segments = segmentLabel(label);
  let units = 0;
  let prefix = "";
  for (const segment of segments) {
    units += labelUnits(segment);
    if (units > maxUnits) return `${prefix}…`;
    if (units <= maxUnits - 1) prefix += segment;
  }
  return label;
}
