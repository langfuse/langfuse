"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.singleFilter = exports.booleanFilter = exports.numberObjectFilter = exports.stringObjectFilter = exports.arrayOptionsFilter = exports.stringOptionsFilter = exports.numberFilter = exports.stringFilter = exports.timeFilter = exports.filterOperators = void 0;
const zod_1 = require("zod");
exports.filterOperators = {
    datetime: [">", "<", ">=", "<="],
    string: ["=", "contains", "does not contain", "starts with", "ends with"],
    stringOptions: ["any of", "none of"],
    arrayOptions: ["any of", "none of", "all of"],
    number: ["=", ">", "<", ">=", "<="],
    stringObject: ["=", "contains", "does not contain", "starts with", "ends with"],
    numberObject: ["=", ">", "<", ">=", "<="],
    boolean: ["=", "<>"],
};
exports.timeFilter = zod_1.z.object({
    column: zod_1.z.string(),
    operator: zod_1.z.enum(exports.filterOperators.datetime),
    value: zod_1.z.date(),
    type: zod_1.z.literal("datetime"),
});
exports.stringFilter = zod_1.z.object({
    column: zod_1.z.string(),
    operator: zod_1.z.enum(exports.filterOperators.string),
    value: zod_1.z.string(),
    type: zod_1.z.literal("string"),
});
exports.numberFilter = zod_1.z.object({
    column: zod_1.z.string(),
    operator: zod_1.z.enum(exports.filterOperators.number),
    value: zod_1.z.number(),
    type: zod_1.z.literal("number"),
});
exports.stringOptionsFilter = zod_1.z.object({
    column: zod_1.z.string(),
    operator: zod_1.z.enum(exports.filterOperators.stringOptions),
    // do not filter on empty arrays, use refine to check this only at runtime (no type checking)
    value: zod_1.z.array(zod_1.z.string()).refine((v) => v.length > 0),
    type: zod_1.z.literal("stringOptions"),
});
exports.arrayOptionsFilter = zod_1.z.object({
    column: zod_1.z.string(),
    operator: zod_1.z.enum(exports.filterOperators.arrayOptions),
    value: zod_1.z.array(zod_1.z.string()).refine((v) => v.length > 0),
    type: zod_1.z.literal("arrayOptions"),
});
exports.stringObjectFilter = zod_1.z.object({
    type: zod_1.z.literal("stringObject"),
    column: zod_1.z.string(),
    key: zod_1.z.string(), // eg metadata --> "environment"
    operator: zod_1.z.enum(exports.filterOperators.string),
    value: zod_1.z.string(),
});
exports.numberObjectFilter = zod_1.z.object({
    type: zod_1.z.literal("numberObject"),
    column: zod_1.z.string(),
    key: zod_1.z.string(), // eg scores --> "accuracy"
    operator: zod_1.z.enum(exports.filterOperators.number),
    value: zod_1.z.number(),
});
exports.booleanFilter = zod_1.z.object({
    type: zod_1.z.literal("boolean"),
    column: zod_1.z.string(),
    operator: zod_1.z.enum(exports.filterOperators.boolean),
    value: zod_1.z.boolean(),
});
exports.singleFilter = zod_1.z.discriminatedUnion("type", [
    exports.timeFilter,
    exports.stringFilter,
    exports.numberFilter,
    exports.stringOptionsFilter,
    exports.arrayOptionsFilter,
    exports.stringObjectFilter,
    exports.numberObjectFilter,
    exports.booleanFilter,
]);
