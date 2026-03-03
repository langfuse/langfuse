import { UiColumnMappings } from "../../tableDefinitions";

export const experimentItemsTableNativeUiColumnDefinitions: UiColumnMappings = [
  {
    uiTableName: "Metadata",
    uiTableId: "itemMetadata",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."item_metadata"',
  },
  {
    uiTableName: "Start Time",
    uiTableId: "startTime",
    clickhouseTableName: "events_proto",
    clickhouseSelect: 'e."start_time"',
  },
];
