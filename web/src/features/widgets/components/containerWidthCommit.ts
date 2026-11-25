/**
 * Scale that makes a grid laid out at `committedWidth` fill `liveWidth`.
 * The grid stays on the committed layout and this scale is applied with CSS,
 * so charts are not laid out again until the container size settles.
 */
export function containerWidthScale(
  committedWidth: number,
  liveWidth: number,
): number {
  if (committedWidth <= 0 || liveWidth <= 0) return 1;
  return liveWidth / committedWidth;
}

/**
 * Publish a container width to React only once the resize has settled.
 * Intermediate samples stay on the CSS scale so a resize does not re-render
 * every chart.
 */
export function nextContainerWidthCommit(args: {
  pendingWidth: number;
  committedWidth: number | null;
  settled: boolean;
}): { kind: "commit"; width: number } | { kind: "defer" } {
  if (!args.settled) return { kind: "defer" };
  if (args.committedWidth === args.pendingWidth) return { kind: "defer" };
  return { kind: "commit", width: args.pendingWidth };
}
