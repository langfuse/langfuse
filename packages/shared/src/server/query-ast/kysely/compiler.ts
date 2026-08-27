import {
  CreateTableNode,
  CreateViewNode,
  DefaultQueryCompiler,
  InsertQueryNode,
  ParensNode,
  SetOperationNode,
  ValueNode,
  type OperationNode,
  type PrimitiveValueListNode,
  type RootOperationNode,
  type SelectQueryNode,
  type ValueListNode,
} from "kysely";
import type { QueryId } from "kysely";

import {
  ArrayJoinNode,
  ArrayIndexNode,
  type ClickHouseSelectQueryNode,
  type LimitByNode,
} from "./nodes";
import { assertTenancyStamped } from "./tenancy";

const ARRAY_JOIN_SQL: Record<ArrayJoinNode["variant"], string> = {
  default: "array join",
  left: "left array join",
  inner: "inner array join",
};

function canonicalParamValue(value: unknown): string {
  if (value instanceof Date) return `d:${value.toISOString()}`;
  if (Array.isArray(value)) {
    return `a:${JSON.stringify(value)}`;
  }
  return `${typeof value}:${String(value)}`;
}

export function inferClickHouseType(value: unknown): string {
  if (value instanceof Date) return "DateTime64(3)";
  if (Array.isArray(value)) {
    const inner = value.length === 0 ? "String" : inferClickHouseType(value[0]);
    return `Array(${inner})`;
  }
  if (typeof value === "string") return "String";
  if (typeof value === "boolean") return "UInt8";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "Int64" : "Float64";
  }
  if (typeof value === "bigint") return "Int64";
  return "String";
}

/**
 * ClickHouse SQL compiler. Identifier quoting is omitted so `clickhouse format`
 * matches the golden snapshots (unquoted identifiers). Parameters are named
 * `{pN:Type}` binds, interned by (type, value) so UNION branches that reuse
 * the same project_id collapse to one placeholder — matching today's named
 * `{projectId:String}` style after the golden harness's param normalizer.
 *
 * ARRAY JOIN and LIMIT BY are read off extra fields on the select node; they
 * are real {@link ArrayJoinNode}/{@link LimitByNode}s, not raw SQL strings.
 */
export class ClickHouseQueryCompiler extends DefaultQueryCompiler {
  namedParameters: Record<string, unknown> = {};
  private intern = new Map<string, string>();

  constructor() {
    super();
    // FRAGILE: `ArrayIndexNode` is not one of Kysely's closed `OperationNode`
    // kinds, so the default visitor dispatch cannot reach it. We wrap the
    // private `visitNode` and push/pop the private `nodeStack` to route it to
    // `visitArrayIndex`. This couples to Kysely internals and must be
    // re-verified on any Kysely upgrade (pinned at 0.28.17).
    const parentVisit = this.visitNode.bind(this);
    (
      this as unknown as { visitNode: (node: OperationNode) => void }
    ).visitNode = (node: OperationNode) => {
      if (ArrayIndexNode.is(node)) {
        (this as unknown as { nodeStack: OperationNode[] }).nodeStack.push(
          node,
        );
        this.visitArrayIndex(node);
        (this as unknown as { nodeStack: OperationNode[] }).nodeStack.pop();
        return;
      }
      parentVisit(node);
    };
  }

  compileQuery(node: RootOperationNode, queryId: QueryId) {
    this.namedParameters = {};
    this.intern = new Map();
    assertTenancyStamped(node);
    return super.compileQuery(node, queryId);
  }

  protected override getLeftIdentifierWrapper(): string {
    return "";
  }

  protected override getRightIdentifierWrapper(): string {
    return "";
  }

  protected override appendValue(parameter: unknown): void {
    this.append(this.bindValue(parameter));
  }

  /**
   * ClickHouse `IN` takes a single `Array(T)` bind, not a parenthesized value
   * list. Emitting `({p:Array(String)})` is what the golden scores query uses.
   */
  protected override visitPrimitiveValueList(
    node: PrimitiveValueListNode,
  ): void {
    this.append("(");
    this.append(
      this.bindValue([...node.values], inferClickHouseType([...node.values])),
    );
    this.append(")");
  }

  protected override visitValueList(node: ValueListNode): void {
    const values = node.values.map((v) =>
      ValueNode.is(v) ? v.value : undefined,
    );
    if (values.every((v) => v !== undefined)) {
      this.append("(");
      this.append(this.bindValue(values, inferClickHouseType(values)));
      this.append(")");
      return;
    }
    super.visitValueList(node);
  }

  protected override visitSelectQuery(node: SelectQueryNode): void {
    const wrapInParens =
      this.parentNode !== undefined &&
      !ParensNode.is(this.parentNode) &&
      !InsertQueryNode.is(this.parentNode) &&
      !CreateTableNode.is(this.parentNode) &&
      !CreateViewNode.is(this.parentNode) &&
      !SetOperationNode.is(this.parentNode);

    if (this.parentNode === undefined && node.explain) {
      this.visitNode(node.explain);
      this.append(" ");
    }

    if (wrapInParens) {
      this.append("(");
    }

    if (node.with) {
      this.visitNode(node.with);
      this.append(" ");
    }

    this.append("select");

    if (node.distinctOn) {
      this.append(" ");
      this.compileDistinctOn(node.distinctOn);
    }

    if (node.frontModifiers?.length) {
      this.append(" ");
      this.compileList(node.frontModifiers, " ");
    }

    if (node.top) {
      this.append(" ");
      this.visitNode(node.top);
    }

    if (node.selections) {
      this.append(" ");
      this.compileList(node.selections);
    }

    if (node.from) {
      this.append(" ");
      this.visitNode(node.from);
    }

    if (node.joins) {
      this.append(" ");
      this.compileList(node.joins, " ");
    }

    const chNode = node as ClickHouseSelectQueryNode;
    if (chNode.arrayJoins?.length) {
      for (const arrayJoin of chNode.arrayJoins) {
        this.append(" ");
        this.visitArrayJoin(arrayJoin);
      }
    }

    if (node.where) {
      this.append(" ");
      this.visitNode(node.where);
    }

    if (node.groupBy) {
      this.append(" ");
      this.visitNode(node.groupBy);
    }

    if (node.having) {
      this.append(" ");
      this.visitNode(node.having);
    }

    if (node.setOperations) {
      this.append(" ");
      this.compileList(node.setOperations, " ");
    }

    if (node.orderBy) {
      this.append(" ");
      this.visitNode(node.orderBy);
    }

    if (chNode.limitBy) {
      this.append(" ");
      this.visitLimitBy(chNode.limitBy);
    }

    if (node.limit) {
      this.append(" ");
      this.visitNode(node.limit);
    }

    if (node.offset) {
      this.append(" ");
      this.visitNode(node.offset);
    }

    if (node.fetch) {
      this.append(" ");
      this.visitNode(node.fetch);
    }

    if (node.endModifiers?.length) {
      this.append(" ");
      this.compileList(this.sortSelectModifiers([...node.endModifiers]), " ");
    }

    if (wrapInParens) {
      this.append(")");
    }
  }

  private visitArrayIndex(node: ArrayIndexNode): void {
    this.visitNode(node.array);
    this.append("[");
    this.visitNode(node.index);
    this.append("]");
  }

  private visitArrayJoin(node: ArrayJoinNode): void {
    this.append(ARRAY_JOIN_SQL[node.variant]);
    this.append(" ");
    node.items.forEach((item, index) => {
      if (index > 0) this.append(", ");
      this.visitNode(item.expression);
      this.append(" as ");
      this.visitNode(item.alias);
    });
  }

  private visitLimitBy(node: LimitByNode): void {
    this.append("limit ");
    this.visitNode(node.count);
    this.append(" by ");
    this.compileList(node.columns);
  }

  private bindValue(value: unknown, type?: string): string {
    const inferred = type ?? inferClickHouseType(value);
    const key = `${inferred}:${canonicalParamValue(value)}`;
    const existing = this.intern.get(key);
    if (existing) {
      return `{${existing}:${inferred}}`;
    }
    this.addParameter(value);
    const name = `p${this.intern.size + 1}`;
    this.intern.set(key, name);
    this.namedParameters[name] = value;
    return `{${name}:${inferred}}`;
  }
}
