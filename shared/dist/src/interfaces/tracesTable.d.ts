import { type OptionsDefinition, type ColumnDefinition } from "./tableDefinition";
export declare const tracesTableCols: ColumnDefinition[];
export type TraceOptions = {
    scores_avg: Array<string>;
    name: Array<OptionsDefinition>;
    tags: Array<OptionsDefinition>;
};
export declare function tracesTableColsWithOptions(options?: TraceOptions): ColumnDefinition[];
