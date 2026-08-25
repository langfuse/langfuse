import { Column, Table } from "./semanticModel";

class CompilationException extends Error {}
class FilterSpec {}
class AggregationSpec {}
class OrderBySpec {}

// TODO: replace with the real query-plan node once ast.ts is fleshed out
class QueryPlanNode {
  constructor(
    public readonly builder: QueryPlanBuilder,
    public readonly columns: Column[],
  ) {}
}

class QueryPlanBuilder {
  private columns: Column[] = [];
  private filter: FilterSpec | null = null;
  private groupBy: AggregationSpec | null = null;

  constructor(public readonly source: Table) {}

  select(cols: (Column | string)[]) {
    const resolvedCols = this.resolveColumns(cols);
    this.checkSameTableColumn(resolvedCols);
    return new QueryPlanNode(this, resolvedCols);
  }

  private checkSameTableColumn(cols: Column[]): void {
    const invalidCols = cols.filter((col) => col.table !== this.source);
    if (invalidCols.length !== 0) {
      throw new CompilationException(
        `Columns [${invalidCols.map((col) => col.name).join(", ")}] are not present on this table`,
      );
    }
  }

  private resolveColumns(cols: (Column | string)[]): Column[] {
    return cols.map((col) => {
      if (typeof col !== "string") return col;
      const resolved = this.source.columns[col];
      if (!resolved) {
        throw new CompilationException(`Unknown column "${col}" on this table`);
      }
      return resolved;
    });
  }
}
