export type GraphCanvasData = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; arrows: "to" }[];
};
