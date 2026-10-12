const COLORS = [
  "#7c3aed",
  "#0284c7",
  "#059669",
  "#d97706",
  "#db2777",
  "#4f46e5",
  "#0d9488",
  "#c2410c",
  "#65a30d",
  "#a21caf",
];
export const topicColor = (index: number) =>
  index < 0 ? "#94a3b8" : COLORS[index % COLORS.length];
