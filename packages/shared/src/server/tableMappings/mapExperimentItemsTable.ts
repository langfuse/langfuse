import { UiColumnMappings } from "../../tableDefinitions";

export const experimentItemsTableNativeUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Numeric Scores",
    uiTableId: "scores_avg",
    clickhouseTableName: "scores",
    // The level-agnostic aggregate: one array entry per (name, level), so a
    // filter matches a score recorded on the item's root span OR on its trace.
    // The `obs_*` ids are aliases so existing links and saved views keep
    // resolving - and start matching trace-level scores, which is the fix.
    clickhouseSelect: "ias.scores_avg",
    aliases: ["obs_scores_avg"],
  },
  {
    uiTableName: "Categorical Scores",
    uiTableId: "score_categories",
    clickhouseTableName: "scores",
    clickhouseSelect: "ias.score_categories",
    aliases: ["obs_score_categories"],
  },
  {
    uiTableName: "Boolean Scores",
    uiTableId: "score_booleans",
    clickhouseTableName: "scores",
    clickhouseSelect: "ias.score_booleans",
    aliases: ["obs_score_booleans"],
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
    uiTableName: "Trace Scores (boolean)",
    uiTableId: "trace_score_booleans",
    clickhouseTableName: "scores",
    clickhouseSelect: "ts.score_booleans",
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
