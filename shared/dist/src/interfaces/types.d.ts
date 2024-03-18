import { singleFilter } from "@/src/interfaces/filters";
import { type z } from "zod";
export type FilterCondition = z.infer<typeof singleFilter>;
export type FilterState = FilterCondition[];
type MakeOptional<T> = {
    [K in keyof T]?: T[K];
};
type AllowStringAsValue<T> = {
    [K in keyof T]: K extends "value" ? string | T[K] : T[K];
};
export type WipFilterCondition = AllowStringAsValue<MakeOptional<FilterCondition>>;
export type WipFilterState = WipFilterCondition[];
export type FilterOption = {
    value: string;
    count?: number;
};
export {};
