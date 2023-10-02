import {
  type OptionsDefinition,
  type ColumnDefinition,
} from "@/src/server/api/interfaces/tableDefinition";

// to be used server side
export const observationsTableCols: ColumnDefinition[] = [
  {
    name: "name",
    type: "stringOptions",
    internal: 'o."name"',
    options: [], // to be added at runtime
  },
  { name: "userId", type: "string", internal: 't."user_id"' },
  { name: "traceId", type: "string", internal: 't."id"' },
  {
    name: "model",
    type: "stringOptions",
    internal: 'o."model"',
    options: [], // to be added at runtime
  },
  {
    name: "traceName",
    type: "stringOptions",
    internal: 't."name"',
    options: [], // to be added at runtime
  },
];

// to be used client side, insert options for use in filter-builder
// allows for undefined options, to offer filters while options are still loading
export type ObservationOptions = {
  model: Array<OptionsDefinition>;
  name: Array<OptionsDefinition>;
  traceName: Array<OptionsDefinition>;
};

export function observationsTableColsWithOptions(
  options?: ObservationOptions,
): ColumnDefinition[] {
  return observationsTableCols.map((col) => {
    if (col.name === "model") {
      return { ...col, options: options?.model ?? [] };
    }
    if (col.name === "name") {
      return { ...col, options: options?.name ?? [] };
    }
    if (col.name === "traceName") {
      return { ...col, options: options?.traceName ?? [] };
    }
    return col;
  });
}
