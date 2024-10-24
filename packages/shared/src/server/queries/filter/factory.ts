// // FilterFactory.ts

// import { ColumnDefinition } from "../../../tableDefinitions";
// import { FilterCondition } from "../../../types";
// import {
//   arrayFilterToPrismaSql,
//   datetimeFilterToPrismaSql,
//   numberFilterToPrismaSql,
//   stringFilterToPrismaSql,
// } from "./filter-builder";

// export class FilterFactory {
//   static createFilter(
//     filter: FilterCondition,
//     tableColumns: ColumnDefinition[]
//   ): String {
//     // Validate the column name
//     // if (!isValidFilter(table, column)) {
//     //   logger.error("Invalid filter column", column);
//     //   throw new Error("Invalid filter column: " + column);
//     // }

//     const internalColumn = Prisma.raw(`"${table}"."${column}"`); // Adjust according to your naming conventions

//     switch (filter.type) {
//       case "datetime":
//         return datetimeFilterToPrismaSql(
//           internalColumn,
//           filter.operator,
//           filter.value
//         );
//       case "number":
//         return numberFilterToPrismaSql(
//           internalColumn,
//           filter.operator,
//           filter.value
//         );
//       case "string":
//         return stringFilterToPrismaSql(
//           internalColumn,
//           filter.operator,
//           filter.value
//         );
//       case "arrayOptions":
//         return arrayFilterToPrismaSql(
//           internalColumn,
//           filter.operator,
//           filter.value
//         );
//       default:
//         throw new Error("Unsupported filter type");
//     }
//   }
// }
