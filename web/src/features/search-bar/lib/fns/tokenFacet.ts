import { type FilterState, computeSelectedValues } from "@langfuse/shared";
import { type ASTNode, type FilterNode, type Span } from "../ast";
import { type FieldRegistry } from "../fields";
import { parse, serialize } from "../langQ";
import { removeToken } from "../edits";
import {
  applyCheckboxSelection,
  buildOnlySelection,
  deriveOperatorChange,
  type CheckboxOperator,
  type SidebarFilterActionContext,
} from "../../../filters/lib/sidebar-filter-actions";

export type TokenFacetState = {
  query: string;
  span: Span;
  expression: string | null;
  template: FilterNode;
};

export type TokenFacetAction =
  | { kind: "selection"; values: string[] }
  | { kind: "only"; value: string }
  | { kind: "operator"; operator: CheckboxOperator }
  | { kind: "clear" };

export function createTokenFacetState(
  query: string,
  span: Span,
  registry: FieldRegistry,
): TokenFacetState | null {
  const expression = query.slice(span.from, span.to);
  const { ast, valid } = parse(expression, registry);
  const filter = ast?.kind === "not" ? ast.child : ast;
  if (!valid || filter?.kind !== "filter") return null;
  return { query, span, expression, template: filter };
}

function currentFilter(
  state: TokenFacetState,
  registry: FieldRegistry,
): FilterState {
  if (state.expression === null) return [];
  const { ast } = parse(state.expression, registry);
  const filter = ast?.kind === "not" ? ast.child : ast;
  if (filter?.kind !== "filter") return [];
  const ref = registry.resolveField(filter.key);
  const array = ref?.type === "field" && ref.field.syncMode === "arrayOption";
  let operator: CheckboxOperator = "any of";
  if (ast?.kind === "not") operator = "none of";
  else if (filter.valueOp === "and") operator = "all of";
  if (array)
    return [
      {
        column: filter.key,
        type: "arrayOptions",
        operator,
        value: filter.values,
      },
    ];
  return [
    {
      column: filter.key,
      type: "stringOptions",
      operator: operator === "none of" ? "none of" : "any of",
      value: filter.values,
    },
  ];
}

export function tokenFacetModel(
  state: TokenFacetState,
  observedValues: readonly string[],
  registry: FieldRegistry,
) {
  const filters = currentFilter(state, registry);
  const current = filters[0];
  const options = Array.from(
    new Set([
      ...observedValues,
      ...state.template.values,
      ...filters.flatMap((filter) =>
        Array.isArray(filter.value) ? (filter.value as string[]) : [],
      ),
    ]),
  );
  const ref = registry.resolveField(state.template.key);
  const array = ref?.type === "field" && ref.field.syncMode === "arrayOption";
  return {
    filters,
    options,
    value: computeSelectedValues(options, current),
    operator: current?.operator as CheckboxOperator | undefined,
    array,
  };
}

export function applyTokenFacetAction(
  state: TokenFacetState,
  observedValues: readonly string[],
  action: TokenFacetAction,
  registry: FieldRegistry,
): TokenFacetState {
  const model = tokenFacetModel(state, observedValues, registry);
  const column = state.template.key;
  const context: SidebarFilterActionContext = {
    facets: [{ type: "categorical", column, label: column }],
    columnDefinitions: [
      {
        id: column,
        name: column,
        internal: column,
        type: model.array ? "arrayOptions" : "stringOptions",
        options: [],
      },
    ],
    options: { [column]: model.options },
  };
  let next: FilterState;
  if (action.kind === "clear") next = [];
  else if (action.kind === "selection") {
    // The option list is partial. Checking every known value must preserve
    // the explicit membership predicate instead of broadening it to all rows.
    const preservePositive =
      action.values.length > 0 &&
      (model.operator === "any of" || model.operator === "all of");
    next = applyCheckboxSelection(
      context,
      model.filters,
      column,
      action.values,
      preservePositive ? model.operator : undefined,
    );
  } else if (action.kind === "only") {
    if (model.value.length === 1 && model.value.includes(action.value)) {
      next = applyCheckboxSelection(
        context,
        model.filters,
        column,
        model.options,
      );
    } else {
      const selection = buildOnlySelection(
        context,
        model.filters,
        column,
        action.value,
      );
      if (selection === null) return state;
      next = applyCheckboxSelection(
        context,
        model.filters,
        column,
        selection.values,
        selection.operator,
      );
    }
  } else {
    const selection = deriveOperatorChange(context, model.filters, column);
    if (selection === null || selection.values.length === 0) return state;
    next = applyCheckboxSelection(
      context,
      model.filters,
      column,
      selection.values,
      action.operator,
    );
  }
  const nextFilter = next[0];
  if (nextFilter === undefined) {
    if (state.expression === null) return state;
    const query = removeToken(state.query, state.span, registry);
    return {
      ...state,
      query,
      expression: null,
      span: { from: query.length, to: query.length },
    };
  }
  if (nextFilter.type !== "stringOptions" && nextFilter.type !== "arrayOptions")
    return state;
  const ref = registry.resolveField(column);
  const node: FilterNode = {
    ...state.template,
    op:
      nextFilter.value.length === 1 &&
      ref?.type === "field" &&
      ref.field.syncMode === "textSearch"
        ? "exact"
        : "=",
    values: nextFilter.value,
    valueOp: nextFilter.operator === "all of" ? "and" : "or",
  };
  const ast: ASTNode =
    nextFilter.operator === "none of" ? { kind: "not", child: node } : node;
  const expression = serialize(ast, registry);
  if (state.expression === null) {
    const before = state.query.trimEnd();
    const prefix = before.length > 0 ? `${before} ` : "";
    return {
      ...state,
      query: prefix + expression,
      expression,
      span: { from: prefix.length, to: prefix.length + expression.length },
    };
  }
  return {
    ...state,
    expression,
    query:
      state.query.slice(0, state.span.from) +
      expression +
      state.query.slice(state.span.to),
    span: { from: state.span.from, to: state.span.from + expression.length },
  };
}
