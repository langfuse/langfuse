"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.record = void 0;
const Schema_1 = require("../../Schema");
const entries_1 = require("../../utils/entries");
const getErrorMessageForIncorrectType_1 = require("../../utils/getErrorMessageForIncorrectType");
const isPlainObject_1 = require("../../utils/isPlainObject");
const maybeSkipValidation_1 = require("../../utils/maybeSkipValidation");
const schema_utils_1 = require("../schema-utils");
function record(keySchema, valueSchema) {
    const baseSchema = {
        parse: async (raw, opts) => {
            return validateAndTransformRecord({
                value: raw,
                isKeyNumeric: (await keySchema.getType()) === Schema_1.SchemaType.NUMBER,
                transformKey: (key) => keySchema.parse(key, {
                    ...opts,
                    breadcrumbsPrefix: [...(opts?.breadcrumbsPrefix ?? []), `${key} (key)`],
                }),
                transformValue: (value, key) => valueSchema.parse(value, {
                    ...opts,
                    breadcrumbsPrefix: [...(opts?.breadcrumbsPrefix ?? []), `${key}`],
                }),
                breadcrumbsPrefix: opts?.breadcrumbsPrefix,
            });
        },
        json: async (parsed, opts) => {
            return validateAndTransformRecord({
                value: parsed,
                isKeyNumeric: (await keySchema.getType()) === Schema_1.SchemaType.NUMBER,
                transformKey: (key) => keySchema.json(key, {
                    ...opts,
                    breadcrumbsPrefix: [...(opts?.breadcrumbsPrefix ?? []), `${key} (key)`],
                }),
                transformValue: (value, key) => valueSchema.json(value, {
                    ...opts,
                    breadcrumbsPrefix: [...(opts?.breadcrumbsPrefix ?? []), `${key}`],
                }),
                breadcrumbsPrefix: opts?.breadcrumbsPrefix,
            });
        },
        getType: () => Schema_1.SchemaType.RECORD,
    };
    return {
        ...(0, maybeSkipValidation_1.maybeSkipValidation)(baseSchema),
        ...(0, schema_utils_1.getSchemaUtils)(baseSchema),
    };
}
exports.record = record;
async function validateAndTransformRecord({ value, isKeyNumeric, transformKey, transformValue, breadcrumbsPrefix = [], }) {
    if (!(0, isPlainObject_1.isPlainObject)(value)) {
        return {
            ok: false,
            errors: [
                {
                    path: breadcrumbsPrefix,
                    message: (0, getErrorMessageForIncorrectType_1.getErrorMessageForIncorrectType)(value, "object"),
                },
            ],
        };
    }
    return (0, entries_1.entries)(value).reduce(async (accPromise, [stringKey, value]) => {
        // skip nullish keys
        if (value == null) {
            return accPromise;
        }
        const acc = await accPromise;
        let key = stringKey;
        if (isKeyNumeric) {
            const numberKey = stringKey.length > 0 ? Number(stringKey) : NaN;
            if (!isNaN(numberKey)) {
                key = numberKey;
            }
        }
        const transformedKey = await transformKey(key);
        const transformedValue = await transformValue(value, key);
        if (acc.ok && transformedKey.ok && transformedValue.ok) {
            return {
                ok: true,
                value: {
                    ...acc.value,
                    [transformedKey.value]: transformedValue.value,
                },
            };
        }
        const errors = [];
        if (!acc.ok) {
            errors.push(...acc.errors);
        }
        if (!transformedKey.ok) {
            errors.push(...transformedKey.errors);
        }
        if (!transformedValue.ok) {
            errors.push(...transformedValue.errors);
        }
        return {
            ok: false,
            errors,
        };
    }, Promise.resolve({ ok: true, value: {} }));
}
