import { ColumnDefinition, TableNames } from "../../tableDefinitions";
import { FilterState } from "../../types";
import { logger } from "../logger";

export const filterToClickhouse = (
  filters: FilterState,
  tableColumns: ColumnDefinition[],
  table: TableNames
) => {
  logger.info("Converting filters to Clickhouse filter", {
    filters,
    tableColumns,
    table,
  });

  const sql = "";

  return sql.length > 0 ? `AND ${sql}` : "";
};


const generateFilter = (filter: FilterState, tableColumns: ColumnDefinition[], table: TableNames) => {