"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObjectUtils = exports.object = void 0;
const Schema_1 = require("../../Schema");
const entries_1 = require("../../utils/entries");
const filterObject_1 = require("../../utils/filterObject");
const getErrorMessageForIncorrectType_1 = require("../../utils/getErrorMessageForIncorrectType");
const isPlainObject_1 = require("../../utils/isPlainObject");
const keys_1 = require("../../utils/keys");
const maybeSkipValidation_1 = require("../../utils/maybeSkipValidation");
const partition_1 = require("../../utils/partition");
const object_like_1 = require("../object-like");
const schema_utils_1 = require("../schema-utils");
const property_1 = require("./property");
function object(schemas) {
    const baseSchema = {
        _getRawProperties: () => Promise.resolve(Object.entries(schemas).map(([parsedKey, propertySchema]) => (0, property_1.isProperty)(propertySchema) ? propertySchema.rawKey : parsedKey)),
        _getParsedProperties: () => Promise.resolve((0, keys_1.keys)(schemas)),
        parse: async (raw, opts) => {
            const rawKeyToProperty = {};
            const requiredKeys = [];
            for (const [parsedKey, schemaOrObjectProperty] of (0, entries_1.entries)(schemas)) {
                const rawKey = (0, property_1.isProperty)(schemaOrObjectProperty) ? schemaOrObjectProperty.rawKey : parsedKey;
                const valueSchema = (0, property_1.isProperty)(schemaOrObjectProperty)
                    ? schemaOrObjectProperty.valueSchema
                    : schemaOrObjectProperty;
                const property = {
                    rawKey,
                    parsedKey: parsedKey,
                    valueSchema,
                };
                rawKeyToProperty[rawKey] = property;
                if (await isSchemaRequired(valueSchema)) {
                    requiredKeys.push(rawKey);
                }
            }
            return validateAndTransformObject({
                value: raw,
                requiredKeys,
                getProperty: (rawKey) => {
                    const property = rawKeyToProperty[rawKey];
                    if (property == null) {
                        return undefined;
                    }
                    return {
                        transformedKey: property.parsedKey,
                        transform: (propertyValue) => property.valueSchema.parse(propertyValue, {
                            ...opts,
                            breadcrumbsPrefix: [...(opts?.breadcrumbsPrefix ?? []), rawKey],
                        }),
                    };
                },
                unrecognizedObjectKeys: opts?.unrecognizedObjectKeys,
                skipValidation: opts?.skipValidation,
                breadcrumbsPrefix: opts?.breadcrumbsPrefix,
            });
        },
        json: async (parsed, opts) => {
            const requiredKeys = [];
            for (const [parsedKey, schemaOrObjectProperty] of (0, entries_1.entries)(schemas)) {
                const valueSchema = (0, property_1.isProperty)(schemaOrObjectProperty)
                    ? schemaOrObjectProperty.valueSchema
                    : schemaOrObjectProperty;
                if (await isSchemaRequired(valueSchema)) {
                    requiredKeys.push(parsedKey);
                }
            }
            return validateAndTransformObject({
                value: parsed,
                requiredKeys,
                getProperty: (parsedKey) => {
                    const property = schemas[parsedKey];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (property == null) {
                        return undefined;
                    }
                    if ((0, property_1.isProperty)(property)) {
                        return {
                            transformedKey: property.rawKey,
                            transform: (propertyValue) => property.valueSchema.json(propertyValue, {
                                ...opts,
                                breadcrumbsPrefix: [...(opts?.breadcrumbsPrefix ?? []), parsedKey],
                            }),
                        };
                    }
                    else {
                        return {
                            transformedKey: parsedKey,
                            transform: (propertyValue) => property.json(propertyValue, {
                                ...opts,
                                breadcrumbsPrefix: [...(opts?.breadcrumbsPrefix ?? []), parsedKey],
                            }),
                        };
                    }
                },
                unrecognizedObjectKeys: opts?.unrecognizedObjectKeys,
                skipValidation: opts?.skipValidation,
                breadcrumbsPrefix: opts?.breadcrumbsPrefix,
            });
        },
        getType: () => Schema_1.SchemaType.OBJECT,
    };
    return {
        ...(0, maybeSkipValidation_1.maybeSkipValidation)(baseSchema),
        ...(0, schema_utils_1.getSchemaUtils)(baseSchema),
        ...(0, object_like_1.getObjectLikeUtils)(baseSchema),
        ...getObjectUtils(baseSchema),
    };
}
exports.object = object;
async function validateAndTransformObject({ value, requiredKeys, getProperty, unrecognizedObjectKeys = "fail", skipValidation = false, breadcrumbsPrefix = [], }) {
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
    const missingRequiredKeys = new Set(requiredKeys);
    const errors = [];
    const transformed = {};
    for (const [preTransformedKey, preTransformedItemValue] of Object.entries(value)) {
        const property = getProperty(preTransformedKey);
        if (property != null) {
            missingRequiredKeys.delete(preTransformedKey);
            const value = await property.transform(preTransformedItemValue);
            if (value.ok) {
                transformed[property.transformedKey] = value.value;
            }
            else {
                transformed[preTransformedKey] = preTransformedItemValue;
                errors.push(...value.errors);
            }
        }
        else {
            switch (unrecognizedObjectKeys) {
                case "fail":
                    errors.push({
                        path: [...breadcrumbsPrefix, preTransformedKey],
                        message: `Unexpected key "${preTransformedKey}"`,
                    });
                    break;
                case "strip":
                    break;
                case "passthrough":
                    transformed[preTransformedKey] = preTransformedItemValue;
                    break;
            }
        }
    }
    errors.push(...requiredKeys
        .filter((key) => missingRequiredKeys.has(key))
        .map((key) => ({
        path: breadcrumbsPrefix,
        message: `Missing required key "${key}"`,
    })));
    if (errors.length === 0 || skipValidation) {
        return {
            ok: true,
            value: transformed,
        };
    }
    else {
        return {
            ok: false,
            errors,
        };
    }
}
function getObjectUtils(schema) {
    return {
        extend: (extension) => {
            const baseSchema = {
                _getParsedProperties: async () => [
                    ...(await schema._getParsedProperties()),
                    ...(await extension._getParsedProperties()),
                ],
                _getRawProperties: async () => [
                    ...(await schema._getRawProperties()),
                    ...(await extension._getRawProperties()),
                ],
                parse: async (raw, opts) => {
                    return validateAndTransformExtendedObject({
                        extensionKeys: await extension._getRawProperties(),
                        value: raw,
                        transformBase: (rawBase) => schema.parse(rawBase, opts),
                        transformExtension: (rawExtension) => extension.parse(rawExtension, opts),
                    });
                },
                json: async (parsed, opts) => {
                    return validateAndTransformExtendedObject({
                        extensionKeys: await extension._getParsedProperties(),
                        value: parsed,
                        transformBase: (parsedBase) => schema.json(parsedBase, opts),
                        transformExtension: (parsedExtension) => extension.json(parsedExtension, opts),
                    });
                },
                getType: () => Schema_1.SchemaType.OBJECT,
            };
            return {
                ...baseSchema,
                ...(0, schema_utils_1.getSchemaUtils)(baseSchema),
                ...(0, object_like_1.getObjectLikeUtils)(baseSchema),
                ...getObjectUtils(baseSchema),
            };
        },
    };
}
exports.getObjectUtils = getObjectUtils;
async function validateAndTransformExtendedObject({ extensionKeys, value, transformBase, transformExtension, }) {
    const extensionPropertiesSet = new Set(extensionKeys);
    const [extensionProperties, baseProperties] = (0, partition_1.partition)((0, keys_1.keys)(value), (key) => extensionPropertiesSet.has(key));
    const transformedBase = await transformBase((0, filterObject_1.filterObject)(value, baseProperties));
    const transformedExtension = await transformExtension((0, filterObject_1.filterObject)(value, extensionProperties));
    if (transformedBase.ok && transformedExtension.ok) {
        return {
            ok: true,
            value: {
                ...transformedBase.value,
                ...transformedExtension.value,
            },
        };
    }
    else {
        return {
            ok: false,
            errors: [
                ...(transformedBase.ok ? [] : transformedBase.errors),
                ...(transformedExtension.ok ? [] : transformedExtension.errors),
            ],
        };
    }
}
async function isSchemaRequired(schema) {
    return !(await isSchemaOptional(schema));
}
async function isSchemaOptional(schema) {
    switch (await schema.getType()) {
        case Schema_1.SchemaType.ANY:
        case Schema_1.SchemaType.UNKNOWN:
        case Schema_1.SchemaType.OPTIONAL:
            return true;
        default:
            return false;
    }
}
