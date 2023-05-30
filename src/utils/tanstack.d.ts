export declare module "@tanstack/table-core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    updateFunction: (newValues: string[] | null) => void;
    filter: string[] | null;
  }
}
