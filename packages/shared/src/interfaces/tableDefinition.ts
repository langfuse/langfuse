export type OptionsDefinition = {
  value: string;
  count?: number;
};

export type ColumnDefinition =
  | {
      name: string;
      id: string;
      type: "number" | "string" | "datetime" | "boolean";
      internal: string;
    }
  | {
      name: string;
      id: string;
      type: "stringOptions";
      options: Array<OptionsDefinition>;
      internal: string;
    }
  | {
      name: string;
      id: string;
      type: "arrayOptions";
      options: Array<OptionsDefinition>;
      internal: string;
    }
  | {
      name: string;
      id: string;
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
  "prompts",
  "users",
] as const;

export type TableNames = (typeof tableNames)[number];

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: ColumnDefinition[];
  };
};
