import { ColumnDefinition, type TableNames as TableName } from "@/src/interfaces/tableDefinition";
import { FilterState } from "@/src/interfaces/types";
import { Prisma } from "@prisma/client";
/**
 * SECURITY: This function must only be used, when all its inputs were verified with zod.
 */
export declare function tableColumnsToSqlFilterAndPrefix(filters: FilterState, tableColumns: ColumnDefinition[], table: TableName): Prisma.Sql;
/**
 * SECURITY: This function must only be used, when all its inputs were verified with zod.
 * Converts filter state and table columns to a Prisma SQL filter.
 */
export declare function tableColumnsToSqlFilter(filters: FilterState, tableColumns: ColumnDefinition[], table: TableName): Prisma.Sql;
declare const dateOperators: readonly [">", "<", ">=", "<="];
export declare const datetimeFilterToPrismaSql: (safeColumn: string, operator: (typeof dateOperators)[number], value: Date) => Prisma.Sql;
export {};
