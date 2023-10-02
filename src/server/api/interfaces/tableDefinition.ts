export type OptionsDefinition = {
  value: string;
  count?: number;
};

export type ColumnDefinition =
  | {
      name: string;
      type: "number" | "string" | "datetime";
      internal: string;
    }
  | {
      name: string;
      type: "stringOptions";
      options: Array<OptionsDefinition>;
      internal: string;
    }
  | {
      name: string;
      type: "stringObject" | "numberObject";
      internal: string;
      keyOptions?: Array<string>;
    };

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: ColumnDefinition[];
  };
};
