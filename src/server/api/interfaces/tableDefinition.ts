export type OptionsDefinition = {
  value: string;
  count?: number;
};

export type ColumnDefinition =
  | {
      name: string;
      id?: string; // TODO: Adopt for all tables
      type: "number" | "string" | "datetime" | "boolean";
      internal: string;
    }
  | {
      name: string;
      id?: string; // TODO: Adopt for all tables
      type: "stringOptions";
      options: Array<OptionsDefinition>;
      internal: string;
    }
  | {
      name: string;
      id?: string; // TODO: Adopt for all tables
      type: "arrayOptions";
      options: Array<OptionsDefinition>;
      internal: string;
    }
  | {
      name: string;
      id?: string; // TODO: Adopt for all tables
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
