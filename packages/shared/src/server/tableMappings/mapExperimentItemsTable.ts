import { UiColumnMappings } from "../../tableDefinitions";

export const experimentItemsTableNativeUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Scores (numeric)",
    uiTableId: "obs_scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.scores_avg",
  },
  {
    uiTableName: "Scores (categorical)",
    uiTableId: "obs_score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "s.score_categories",
  },
  {
    uiTableName: "Trace Scores (numeric)",
    uiTableId: "trace_scores_avg",
    clickhouseTableName: "scores",
    clickhouseSelect: "ts.scores_avg",
  },
  {
    uiTableName: "Trace Scores (categorical)",
    uiTableId: "trace_score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "ts.score_categories",
  },
  {
    uiTableName: "Item Metadata",
    uiTableId: "itemMetadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "experiment_item_metadata",
    queryPrefix: "e",
  },
  {
    uiTableName: "Metadata",
    uiTableId: "eventMetadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: "metadata",
    queryPrefix: "e",
  },
];
