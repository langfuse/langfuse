export * from "./scores";
export * from "./traces";
export * from "./observations";
export * from "./events";
export * from "./types";
export * from "./dashboards";
export * from "./traces_converters";
export * from "./scores_converters";
export * from "./observations_converters";
export * from "./clickhouse";
export * from "./constants";
export * from "./trace-sessions";
export * from "./scores-utils";
export * from "./blobStorageLog";
export * from "./environments";
export * from "./automation-repository";
export * from "./dataset-run-items-converters";
export * from "./dataset-run-items";
export * from "./dataset-items-columns";
export * from "./dataset-items";
export * from "./comments";

import { isOceanBase } from "../../utils/oceanbase";

declare const module: { exports: Record<string, unknown> };
declare function require(id: string): Record<string, unknown>;

if (isOceanBase()) {
  const newExports: Record<string, unknown> = {
    ...(module.exports as Record<string, unknown>),
    ...require("../repositoriesOb/scores"),
    ...require("../repositoriesOb/traces"),
    ...require("../repositoriesOb/observations"),
    ...require("../repositoriesOb/events"),
    ...require("../repositoriesOb/dashboards"),
    ...require("../repositoriesOb/blobStorageLog"),
    ...require("../repositoriesOb/environments"),
    ...require("../repositoriesOb/scores-utils"),
    ...require("../repositoriesOb/oceanbase"),
    ...require("../repositoriesOb/dataset-run-items"),
  };
  module.exports = newExports;
}
