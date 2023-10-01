export type ColumnDefinition =
  | {
      name: string;
      type: "number" | "string" | "datetime";
      internal: string;
    }
  | {
      name: string;
      type: "stringOptions";
      options: { value: string; count?: number }[];
      internal: string;
    };

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: ColumnDefinition[];
  };
};
