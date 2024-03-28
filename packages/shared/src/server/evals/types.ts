import { observationsTableCols, tracesTableCols } from "../..";

export const evalObjects = [
  {
    id: "trace",
    display: "Trace",
    availableColumns: [
      ...tracesTableCols.map((c) => ({
        name: c.name,
        id: c.id,
        internal: c.internal,
      })),
      { name: "Input", id: "input", internal: 't."input"' },
      { name: "Output", id: "output", internal: 't."output"' },
    ],
  },
  {
    id: "span",
    display: "Span",
    availableColumns: [
      ...observationsTableCols.map((c) => ({
        name: c.name,
        id: c.id,
        internal: c.internal,
      })),
      { name: "Input", id: "input", internal: 'o."input"' },
      { name: "Output", id: "output", internal: 'o."output"' },
    ],
  },
  {
    id: "generation",
    display: "Generation",
    availableColumns: [
      ...observationsTableCols.map((c) => ({
        name: c.name,
        id: c.id,
        internal: c.internal,
      })),
      { name: "Input", id: "input", internal: 'o."input"' },
      { name: "Output", id: "output", internal: 'o."output"' },
    ],
  },
  { id: "event", display: "Event", availableColumns: observationsTableCols },
];
