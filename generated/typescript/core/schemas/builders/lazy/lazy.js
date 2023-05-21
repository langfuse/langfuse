"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMemoizedSchema = exports.constructLazyBaseSchema = exports.lazy = void 0;
const schema_utils_1 = require("../schema-utils");
function lazy(getter) {
    const baseSchema = constructLazyBaseSchema(getter);
    return {
        ...baseSchema,
        ...(0, schema_utils_1.getSchemaUtils)(baseSchema),
    };
}
exports.lazy = lazy;
function constructLazyBaseSchema(getter) {
    return {
        parse: async (raw, opts) => (await getMemoizedSchema(getter)).parse(raw, opts),
        json: async (parsed, opts) => (await getMemoizedSchema(getter)).json(parsed, opts),
        getType: async () => (await getMemoizedSchema(getter)).getType(),
    };
}
exports.constructLazyBaseSchema = constructLazyBaseSchema;
async function getMemoizedSchema(getter) {
    const castedGetter = getter;
    if (castedGetter.__zurg_memoized == null) {
        castedGetter.__zurg_memoized = await getter();
    }
    return castedGetter.__zurg_memoized;
}
exports.getMemoizedSchema = getMemoizedSchema;
