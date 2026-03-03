export * from "./mapObservationsTable";
export * from "./mapTracesTable";
export * from "./mapEventsTable";
export * from "../../tableDefinitions/mapDashboards";
export * from "./mapScoresTable";
export * from "./mapDatasetRunItemsTable";

import { isOceanBase } from "../../utils/oceanbase";

if (isOceanBase()) {
  const newExports: Record<string, unknown> = {
    ...(module.exports as Record<string, unknown>),
    ...require("../tableMappingsOb/mapObservationsTable"),
    ...require("../tableMappingsOb/mapTracesTable"),
    ...require("../tableMappingsOb/mapEventsTable"),
  };
  module.exports = newExports;
}
