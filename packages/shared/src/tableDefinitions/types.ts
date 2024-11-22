export type UiColumnMapping = {
  uiTableName: string;
  uiTableId: string;
  clickhouseTableName: string;
  clickhouseSelect: string;
  clickhouseTypeOverwrite?: string;
  queryPrefix?: string;
};

export type OptionsDefinition = {
  value: string;
  count?: number;
  displayValue?: string; // FIX: Temporary workaround: Used to display a different value than the actual value since multiSelect doesn't support key-value pairs
};

export type ColumnDefinition =
  | {
      name: string;
      id: string;
      type: "number" | "string" | "datetime" | "boolean";
      internal: string;
      nullable?: boolean;
    }
  | {
      name: string;
      id: string;
      type: "stringOptions";
      options: Array<OptionsDefinition>;
      internal: string;
      nullable?: boolean;
    }
  | {
      name: string;
      id: string;
      type: "arrayOptions";
      options: Array<OptionsDefinition>;
      internal: string;
      nullable?: boolean;
    }
  | {
      name: string;
      id: string;
      type: "stringObject" | "numberObject";
      internal: string;
      keyOptions?: Array<string>;
      nullable?: boolean;
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
  "dataset_items",
] as const;

export type TableNames = (typeof tableNames)[number];

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: ColumnDefinition[];
  };
};
