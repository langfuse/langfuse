export type UiColumnMappings = readonly UiColumnMapping[];

export type UiColumnMapping = Readonly<{
  uiTableName: string;
  uiTableId: string;
  clickhouseTableName: string;
  clickhouseSelect: string;
  clickhouseTypeOverwrite?: string;
  queryPrefix?: string;
}>;

export type SingleValueOption = {
  value: string;
  count?: number;
  displayValue?: string; // FIX: Temporary workaround: Used to display a different value than the actual value since multiSelect doesn't support key-value pairs
};

export type MultiValueOption = {
  label: string;
  values: string[];
};

export type OptionsDefinition = SingleValueOption | MultiValueOption;

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
      type: "positionInTrace";
      internal: string;
      nullable?: boolean;
    }
  | {
      name: string;
      id: string;
      type: "stringOptions";
      options: Array<SingleValueOption>;
      internal: string;
      nullable?: boolean;
    }
  | {
      name: string;
      id: string;
      type: "arrayOptions";
      options: Array<SingleValueOption>;
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
    }
  | {
      name: string;
      id: string;
      type: "categoryOptions";
      options: Array<MultiValueOption>;
      internal: string;
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
  "job_configurations",
  "job_executions",
  "dataset_items",
  "annotation_queue_assignments",
  "dataset_item_events",
] as const;

export type TableNames = (typeof tableNames)[number];

export type TableDefinitions = {
  [tableName: string]: {
    table: string;
    columns: ColumnDefinition[];
  };
};
