import { Column, Table } from "./semanticModel";

abstract class Expr {}

abstract class FilterTree {}

abstract class AbstractQueryPlan {
  abstract getSource(): Table | AbstractQueryPlan;
  abstract filter(): FilterTree; // contents of the filter
  abstract getSchema(): Expr[];
  abstract toSql(): string;
  abstract validate(): void;
}

class QueryJoinNode extends AbstractQueryPlan {
  left(): AbstractQueryPlan {
    throw new Error("TODO: not implemented");
  }
  right(): AbstractQueryPlan {
    throw new Error("TODO: not implemented");
  }
  getSource(): Table | AbstractQueryPlan {
    throw new Error("TODO: not implemented");
  }
  filter(): FilterTree {
    throw new Error("TODO: not implemented");
  }
  getSchema(): Expr[] {
    throw new Error("TODO: not implemented");
  }
  toSql(): string {
    throw new Error("TODO: not implemented");
  }
  validate(): void {
    throw new Error("TODO: not implemented");
  }
}

class QueryPlan extends AbstractQueryPlan {
  constructor(
    public readonly source: Table,
    public readonly outputCols: Column[],
  ) {
    super();
  }

  getSource(): Table | AbstractQueryPlan {
    return this.source;
  }
  filter(): FilterTree {
    throw new Error("TODO: not implemented");
  }
  getSchema(): Expr[] {
    return this.outputCols;
  }
  toSql(): string {
    return `SELECT ${this.outputCols.map((col) => col.name).join(", ")} FROM ${this.source.name}`;
  }
  validate(): void {}
}

// const query = scores.select(a, b, c).filter(and(gt(a, 5), eq(b, "asd"))
// const query = sc.select(fn.format(sc.a), sc.b, sc.c).filter(and(gt(a, 5), eq(b, "asd"))
