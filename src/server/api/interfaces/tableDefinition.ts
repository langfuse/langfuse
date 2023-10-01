export type ColumnDefinition = {
  name: string;
  type: "number" | "string" | "datetime";
  internal: string;
};

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: ColumnDefinition[];
  };
};
