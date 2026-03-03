import { UiColumnMappings } from "../../tableDefinitions";

export const experimentItemsTableNativeUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Item Metadata",
    uiTableId: "itemMetadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."experiment_item_metadata"',
  },
  {
    uiTableName: "Metadata",
    uiTableId: "eventMetadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."metadata"',
  },
  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."start_time"',
  },
];
