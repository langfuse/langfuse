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

export const tableNames = [
  "traces",
  "traces_observations",
  "traces_observationsview",
  "observations",
  "traces_scores",
  "traces_metrics",
  "traces_parent_observation_scores",
  "sessions",
] as const;

export type TableNames = (typeof tableNames)[number];

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: ColumnDefinition[];
  };
};
