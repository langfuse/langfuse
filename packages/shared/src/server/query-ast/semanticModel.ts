import mapValues from "lodash/mapValues";
import keyBy from "lodash/keyBy";
import { z } from "zod";

export const ColumnDataTypePrimitive = z.enum([
  "string",
  "float",
  "int",
  "uint",
  "boolean",
  "dateTime",
  "date",
  "uuid",
]);
export type ColumnDataTypePrimitive = z.infer<typeof ColumnDataTypePrimitive>;

export const clickhouseTypeName: Record<ColumnDataTypePrimitive, string> = {
  string: "String",
  float: "Float64",
  int: "Int64",
  uint: "UInt64",
  boolean: "Bool",
  dateTime: "DateTime64",
  date: "Date",
  uuid: "UUID",
};

class ColumnDataType {
  constructor(
    public readonly primitive: ColumnDataTypePrimitive,
    public readonly nullable: boolean,
    public readonly options: Record<string, unknown>,
  ) {}
}

export class Column {
  public table: Table | undefined;

  constructor(
    public readonly name: string,
    public readonly type: ColumnDataType,
  ) {}

  setTable(table: Table) {
    this.table = table;
  }
}

class ColumnRef {
  constructor(public readonly source: ColumnRef | Column) {}
}

class ColumnSpec<Name extends string = string> {
  constructor(
    public readonly name: Name,
    public readonly type: ColumnDataType,
  ) {}
}

export function column<Name extends string>(
  name: Name,
  primitive: ColumnDataTypePrimitive,
  nullable = false,
  options: Record<string, unknown> = {},
): ColumnSpec<Name> {
  return new ColumnSpec(name, new ColumnDataType(primitive, nullable, options));
}

export const FnTypePrimitive = z.enum(["toDate", "toYYYYMM"]);

export type FnTypePrimitive = z.infer<typeof FnTypePrimitive>;

class FnCallSpec {
  constructor(
    public readonly type: FnTypePrimitive,
    public readonly args: (string | FnCallSpec)[],
    public readonly options: Record<string, unknown> = {},
  ) {}
}

export function fnCall(
  fnType: FnTypePrimitive,
  argument: (string | FnCallSpec)[],
  options: Record<string, unknown> = {},
) {
  return new FnCallSpec(fnType, argument, options);
}

export const SortOrder = z.enum(["asc", "desc"]);

export type SortOrder = z.infer<typeof SortOrder>;

class SortKeys {
  constructor(
    public readonly columns: (Column | FnCallSpec)[],
    public readonly order: SortOrder,
  ) {}
}

class SortKeysSpec {
  constructor(
    public readonly columns: (string | FnCallSpec)[],
    public readonly order: SortOrder,
  ) {}

  transform(columnObjs: Record<string, Column>): SortKeys {
    return new SortKeys(
      this.columns.map((col) =>
        typeof col === "string" ? columnObjs[col] : col,
      ),
      this.order,
    );
  }
}

export function sortKeys(
  columns: (string | FnCallSpec)[],
  order: SortOrder,
): SortKeysSpec {
  return new SortKeysSpec(columns, order);
}

class PartitionKey {
  constructor(public readonly columns: (Column | FnCallSpec)[]) {}
}

class PartitionKeySpec {
  constructor(public readonly columns: (string | FnCallSpec)[]) {}

  transform(columnObjs: Record<string, Column>): PartitionKey {
    return new PartitionKey(
      this.columns.map((col) =>
        typeof col === "string" ? columnObjs[col] : col,
      ),
    );
  }
}

export function partitionKey(
  columns: (string | FnCallSpec)[],
): PartitionKeySpec {
  return new PartitionKeySpec(columns);
}

class PrimaryKey {
  constructor(public readonly columns: (Column | FnCallSpec)[]) {}
}

class PrimaryKeySpec {
  constructor(public readonly columns: (string | FnCallSpec)[]) {}

  transform(columnObjs: Record<string, Column>): PrimaryKey {
    return new PrimaryKey(
      this.columns.map((col) =>
        typeof col === "string" ? columnObjs[col] : col,
      ),
    );
  }
}

export function primaryKey(columns: (string | FnCallSpec)[]): PrimaryKeySpec {
  return new PrimaryKeySpec(columns);
}

export class Table<
  Columns extends Record<string, Column> = Record<string, Column>,
> {
  constructor(
    public readonly name: string,
    public readonly columns: Columns,
    public readonly partitionKey: PartitionKey,
    public readonly primaryKey: PrimaryKey,
    public readonly sortKeys: SortKeys,
  ) {}
}

type ColumnsRecord<C extends readonly ColumnSpec<string>[]> = {
  [K in C[number]["name"]]: Column;
};

class TableSpec<
  C extends readonly ColumnSpec<string>[] = ColumnSpec<string>[],
> {
  constructor(
    public readonly name: string,
    public readonly columns: C,
    public readonly partitionKey: PartitionKeySpec,
    public readonly primaryKey: PrimaryKeySpec,
    public readonly sortKeys: SortKeysSpec,
  ) {}

  transform(): Table<ColumnsRecord<C>> {
    const columnObjs = keyBy(
      this.columns.map((c) => new Column(c.name, c.type)),
      (col) => col.name,
    ) as ColumnsRecord<C>;
    const table = new Table(
      this.name,
      columnObjs,
      this.partitionKey.transform(columnObjs),
      this.primaryKey.transform(columnObjs),
      this.sortKeys.transform(columnObjs),
    );
    (Object.values(columnObjs) as Column[]).forEach((col) => {
      col.setTable(table);
    });
    return table;
  }
}

export function table<const C extends readonly ColumnSpec<string>[]>(
  name: string,
  columns: C,
  partitionKey: PartitionKeySpec,
  primaryKey: PrimaryKeySpec,
  sortKeys: SortKeysSpec,
): TableSpec<C> {
  return new TableSpec(name, columns, partitionKey, primaryKey, sortKeys);
}

// columns, partition by key, engine, primary key, sort key
