export type ColumnDefinition =
  | {
      name: string;
      type: "number" | "string" | "datetime";
      internal: string;
    }
  | {
      name: string;
      type: "stringOptions";
      options: string[];
      internal: string;
    };

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: ColumnDefinition[];
  };
};
