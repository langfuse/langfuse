import {
  MonitorSeveritySchema,
  MonitorStatusSchema,
} from "../features/monitors";

import { ColumnDefinition } from "./types";

/** monitorsTableCols defines the columns the monitors list filter sidebar narrows by. */
export const monitorsTableCols: ColumnDefinition[] = [
  {
    name: "Severity",
    id: "severity",
    type: "stringOptions",
    internal: 'm."severity"',
    options: MonitorSeveritySchema.options.map((value) => ({ value })),
  },
  {
    name: "Name",
    id: "name",
    type: "string",
    internal: 'm."name"',
  },
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: 'm."status"',
    options: MonitorStatusSchema.options.map((value) => ({ value })),
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: 'm."tags"',
    options: [],
  },
];
