"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.datetimeFilterToPrismaSql = exports.tableColumnsToSqlFilter = exports.tableColumnsToSqlFilterAndPrefix = void 0;
const filters_1 = require("shared/src/interfaces/filters");
const client_1 = require("@prisma/client");
const operatorReplacements = {
    "any of": "IN",
    "none of": "NOT IN",
    contains: "ILIKE",
    "does not contain": "NOT ILIKE",
    "starts with": "ILIKE",
    "ends with": "ILIKE",
};
const arrayOperatorReplacements = {
    "any of": "&&",
    "all of": "@>",
    "none of": "&&",
};
/**
 * SECURITY: This function must only be used, when all its inputs were verified with zod.
 */
function tableColumnsToSqlFilterAndPrefix(filters, tableColumns, table) {
    const sql = tableColumnsToSqlFilter(filters, tableColumns, table);
    if (sql === client_1.Prisma.empty) {
        return client_1.Prisma.empty;
    }
    return client_1.Prisma.join([client_1.Prisma.raw("AND "), sql], "");
}
exports.tableColumnsToSqlFilterAndPrefix = tableColumnsToSqlFilterAndPrefix;
/**
 * SECURITY: This function must only be used, when all its inputs were verified with zod.
 * Converts filter state and table columns to a Prisma SQL filter.
 */
function tableColumnsToSqlFilter(filters, tableColumns, table) {
    const internalFilters = filters.map((filter) => {
        // Get column definition to map column to internal name, e.g. "t.id"
        const col = tableColumns.find((c) => 
        // TODO: Only use id instead of name
        c.name === filter.column || c.id === filter.column);
        if (!col) {
            console.error("Invalid filter column", filter.column);
            throw new Error("Invalid filter column: " + filter.column);
        }
        const colPrisma = client_1.Prisma.raw(col.internal);
        return {
            condition: filter,
            internalColumn: colPrisma,
            column: col,
            table: table,
        };
    });
    const statements = internalFilters.map((filterAndColumn) => {
        const filter = filterAndColumn.condition;
        const operatorPrisma = filter.type === "arrayOptions"
            ? client_1.Prisma.raw(arrayOperatorReplacements[filter.operator])
            : filter.operator in operatorReplacements
                ? client_1.Prisma.raw(operatorReplacements[filter.operator])
                : client_1.Prisma.raw(filter.operator); //checked by zod
        // Get prisma value
        let valuePrisma;
        switch (filter.type) {
            case "datetime":
                valuePrisma = client_1.Prisma.sql `${filter.value}::timestamp with time zone at time zone 'UTC'`;
                break;
            case "number":
            case "numberObject":
                valuePrisma = client_1.Prisma.sql `${filter.value.toString()}::DOUBLE PRECISION`;
                break;
            case "string":
            case "stringObject":
                valuePrisma = client_1.Prisma.sql `${filter.value}`;
                break;
            case "stringOptions":
                valuePrisma = client_1.Prisma.sql `(${client_1.Prisma.join(filter.value.map((v) => client_1.Prisma.sql `${v}`))})`;
                break;
            case "arrayOptions":
                valuePrisma = client_1.Prisma.sql `ARRAY[${client_1.Prisma.join(filter.value.map((v) => client_1.Prisma.sql `${v}`), ", ")}] `;
                break;
            case "boolean":
                valuePrisma = client_1.Prisma.sql `${filter.value}`;
                break;
        }
        const jsonKeyPrisma = filter.type === "stringObject" || filter.type === "numberObject" ? client_1.Prisma.sql `->>${filter.key}` : client_1.Prisma.empty;
        const [cast1, cast2] = filter.type === "numberObject"
            ? [client_1.Prisma.raw("cast("), client_1.Prisma.raw(" as double precision)")]
            : [client_1.Prisma.empty, client_1.Prisma.empty];
        const [valuePrefix, valueSuffix] = filter.type === "string" || filter.type === "stringObject"
            ? [
                ["contains", "does not contain", "ends with"].includes(filter.operator)
                    ? client_1.Prisma.raw("'%' || ")
                    : client_1.Prisma.empty,
                ["contains", "does not contain", "starts with"].includes(filter.operator)
                    ? client_1.Prisma.raw(" || '%'")
                    : client_1.Prisma.empty,
            ]
            : [client_1.Prisma.empty, client_1.Prisma.empty];
        const [funcPrisma1, funcPrisma2] = filter.type === "arrayOptions" && filter.operator === "none of"
            ? [client_1.Prisma.raw("NOT ("), client_1.Prisma.raw(")")]
            : [client_1.Prisma.empty, client_1.Prisma.empty];
        return client_1.Prisma.sql `${funcPrisma1}${cast1}${filterAndColumn.internalColumn}${jsonKeyPrisma}${cast2} ${operatorPrisma} ${valuePrefix}${valuePrisma}${castValueToPostgresTypes(filterAndColumn.column, filterAndColumn.table)}${valueSuffix}${funcPrisma2}`;
    });
    if (statements.length === 0) {
        return client_1.Prisma.empty;
    }
    // FOR SECURITY: We join the statements with " AND " to prevent SQL injection.
    // IF WE EVER CHANGE THIS, WE MUST ENSURE THAT USERS ONLY ACCESS THE DATA THEY ARE ALLOWED TO.
    // Example: Or condition on charts API on projectId would break this.
    return client_1.Prisma.join(statements, " AND ");
}
exports.tableColumnsToSqlFilter = tableColumnsToSqlFilter;
const castValueToPostgresTypes = (column, table) => {
    return column.name === "type" &&
        (table === "observations" ||
            table === "traces_observations" ||
            table === "traces_observationsview" ||
            table === "traces_parent_observation_scores")
        ? client_1.Prisma.sql `::"ObservationType"`
        : client_1.Prisma.empty;
};
const dateOperators = filters_1.filterOperators["datetime"];
const datetimeFilterToPrismaSql = (safeColumn, operator, value) => {
    if (!dateOperators.includes(operator)) {
        throw new Error("Invalid operator: " + operator);
    }
    if (isNaN(value.getTime())) {
        throw new Error("Invalid date: " + value.toString());
    }
    return client_1.Prisma.sql `AND ${client_1.Prisma.raw(safeColumn)} ${client_1.Prisma.raw(operator)} ${value}::timestamp with time zone at time zone 'UTC'`;
};
exports.datetimeFilterToPrismaSql = datetimeFilterToPrismaSql;
