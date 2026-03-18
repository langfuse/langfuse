import { UiColumnMappings } from "../../tableDefinitions";

export const experimentItemsTableNativeUiColumnDefinitions: UiColumnMappings = [
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
