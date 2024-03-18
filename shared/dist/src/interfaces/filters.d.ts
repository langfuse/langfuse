import { z } from "zod";
export declare const filterOperators: {
    readonly datetime: readonly [">", "<", ">=", "<="];
    readonly string: readonly ["=", "contains", "does not contain", "starts with", "ends with"];
    readonly stringOptions: readonly ["any of", "none of"];
    readonly arrayOptions: readonly ["any of", "none of", "all of"];
    readonly number: readonly ["=", ">", "<", ">=", "<="];
    readonly stringObject: readonly ["=", "contains", "does not contain", "starts with", "ends with"];
    readonly numberObject: readonly ["=", ">", "<", ">=", "<="];
    readonly boolean: readonly ["=", "<>"];
};
export declare const timeFilter: z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<[">", "<", ">=", "<="]>;
    value: z.ZodDate;
    type: z.ZodLiteral<"datetime">;
}, "strip", z.ZodTypeAny, {
    type: "datetime";
    column: string;
    operator: ">" | "<" | ">=" | "<=";
    value: Date;
}, {
    type: "datetime";
    column: string;
    operator: ">" | "<" | ">=" | "<=";
    value: Date;
}>;
export declare const stringFilter: z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<["=", "contains", "does not contain", "starts with", "ends with"]>;
    value: z.ZodString;
    type: z.ZodLiteral<"string">;
}, "strip", z.ZodTypeAny, {
    type: "string";
    column: string;
    operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
    value: string;
}, {
    type: "string";
    column: string;
    operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
    value: string;
}>;
export declare const numberFilter: z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<["=", ">", "<", ">=", "<="]>;
    value: z.ZodNumber;
    type: z.ZodLiteral<"number">;
}, "strip", z.ZodTypeAny, {
    type: "number";
    column: string;
    operator: ">" | "<" | ">=" | "<=" | "=";
    value: number;
}, {
    type: "number";
    column: string;
    operator: ">" | "<" | ">=" | "<=" | "=";
    value: number;
}>;
export declare const stringOptionsFilter: z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<["any of", "none of"]>;
    value: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
    type: z.ZodLiteral<"stringOptions">;
}, "strip", z.ZodTypeAny, {
    type: "stringOptions";
    column: string;
    operator: "any of" | "none of";
    value: string[];
}, {
    type: "stringOptions";
    column: string;
    operator: "any of" | "none of";
    value: string[];
}>;
export declare const arrayOptionsFilter: z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<["any of", "none of", "all of"]>;
    value: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
    type: z.ZodLiteral<"arrayOptions">;
}, "strip", z.ZodTypeAny, {
    type: "arrayOptions";
    column: string;
    operator: "any of" | "none of" | "all of";
    value: string[];
}, {
    type: "arrayOptions";
    column: string;
    operator: "any of" | "none of" | "all of";
    value: string[];
}>;
export declare const stringObjectFilter: z.ZodObject<{
    type: z.ZodLiteral<"stringObject">;
    column: z.ZodString;
    key: z.ZodString;
    operator: z.ZodEnum<["=", "contains", "does not contain", "starts with", "ends with"]>;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "stringObject";
    column: string;
    operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
    value: string;
    key: string;
}, {
    type: "stringObject";
    column: string;
    operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
    value: string;
    key: string;
}>;
export declare const numberObjectFilter: z.ZodObject<{
    type: z.ZodLiteral<"numberObject">;
    column: z.ZodString;
    key: z.ZodString;
    operator: z.ZodEnum<["=", ">", "<", ">=", "<="]>;
    value: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "numberObject";
    column: string;
    operator: ">" | "<" | ">=" | "<=" | "=";
    value: number;
    key: string;
}, {
    type: "numberObject";
    column: string;
    operator: ">" | "<" | ">=" | "<=" | "=";
    value: number;
    key: string;
}>;
export declare const booleanFilter: z.ZodObject<{
    type: z.ZodLiteral<"boolean">;
    column: z.ZodString;
    operator: z.ZodEnum<["=", "<>"]>;
    value: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    type: "boolean";
    column: string;
    operator: "=" | "<>";
    value: boolean;
}, {
    type: "boolean";
    column: string;
    operator: "=" | "<>";
    value: boolean;
}>;
export declare const singleFilter: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<[">", "<", ">=", "<="]>;
    value: z.ZodDate;
    type: z.ZodLiteral<"datetime">;
}, "strip", z.ZodTypeAny, {
    type: "datetime";
    column: string;
    operator: ">" | "<" | ">=" | "<=";
    value: Date;
}, {
    type: "datetime";
    column: string;
    operator: ">" | "<" | ">=" | "<=";
    value: Date;
}>, z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<["=", "contains", "does not contain", "starts with", "ends with"]>;
    value: z.ZodString;
    type: z.ZodLiteral<"string">;
}, "strip", z.ZodTypeAny, {
    type: "string";
    column: string;
    operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
    value: string;
}, {
    type: "string";
    column: string;
    operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
    value: string;
}>, z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<["=", ">", "<", ">=", "<="]>;
    value: z.ZodNumber;
    type: z.ZodLiteral<"number">;
}, "strip", z.ZodTypeAny, {
    type: "number";
    column: string;
    operator: ">" | "<" | ">=" | "<=" | "=";
    value: number;
}, {
    type: "number";
    column: string;
    operator: ">" | "<" | ">=" | "<=" | "=";
    value: number;
}>, z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<["any of", "none of"]>;
    value: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
    type: z.ZodLiteral<"stringOptions">;
}, "strip", z.ZodTypeAny, {
    type: "stringOptions";
    column: string;
    operator: "any of" | "none of";
    value: string[];
}, {
    type: "stringOptions";
    column: string;
    operator: "any of" | "none of";
    value: string[];
}>, z.ZodObject<{
    column: z.ZodString;
    operator: z.ZodEnum<["any of", "none of", "all of"]>;
    value: z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>;
    type: z.ZodLiteral<"arrayOptions">;
}, "strip", z.ZodTypeAny, {
    type: "arrayOptions";
    column: string;
    operator: "any of" | "none of" | "all of";
    value: string[];
}, {
    type: "arrayOptions";
    column: string;
    operator: "any of" | "none of" | "all of";
    value: string[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"stringObject">;
    column: z.ZodString;
    key: z.ZodString;
    operator: z.ZodEnum<["=", "contains", "does not contain", "starts with", "ends with"]>;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "stringObject";
    column: string;
    operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
    value: string;
    key: string;
}, {
    type: "stringObject";
    column: string;
    operator: "=" | "contains" | "does not contain" | "starts with" | "ends with";
    value: string;
    key: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"numberObject">;
    column: z.ZodString;
    key: z.ZodString;
    operator: z.ZodEnum<["=", ">", "<", ">=", "<="]>;
    value: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "numberObject";
    column: string;
    operator: ">" | "<" | ">=" | "<=" | "=";
    value: number;
    key: string;
}, {
    type: "numberObject";
    column: string;
    operator: ">" | "<" | ">=" | "<=" | "=";
    value: number;
    key: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"boolean">;
    column: z.ZodString;
    operator: z.ZodEnum<["=", "<>"]>;
    value: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    type: "boolean";
    column: string;
    operator: "=" | "<>";
    value: boolean;
}, {
    type: "boolean";
    column: string;
    operator: "=" | "<>";
    value: boolean;
}>]>;
