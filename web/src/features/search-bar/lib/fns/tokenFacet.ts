import { type FilterState, computeSelectedValues } from "@langfuse/shared";
import { type ASTNode, type FilterNode, type Span } from "../ast";
import { type FieldRegistry } from "../fields";
import { parse, serialize } from "../langQ";
import { removeToken } from "../edits";
import { astToFilterState } from "../adapter";
import {
  buildEffectiveEnvironmentFilter,
  canonicalizeExplicitEnvironmentFilters,
  toSearchBarEnvironmentFilters,
  type ManagedEnvironmentPolicyConfig,
} from "../../../filters/lib/managedEnvironmentPolicy";
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
  /** Singleton array expressions do not encode their any-of/all-of preference. */
  operator: CheckboxOperator;
};

export type TokenFacetAction =
  | { kind: "selection"; values: string[] }
  | { kind: "only"; value: string }
  | { kind: "operator"; operator: CheckboxOperator }
  | { kind: "clear" };

function selectedCondition(
  node: ASTNode,
  selected: Span,
): { filter: FilterNode; span: Span; negated: boolean } | null {
  if (node.kind === "and" || node.kind === "or") {
    for (const child of node.children) {
      const found = selectedCondition(child, selected);
      if (found !== null) return found;
    }
    return null;
  }

  const extents: Span[] = [];
  let child: ASTNode = node;
  let negated = false;
  while (child.kind === "not") {
    if (child.span) extents.push(child.span);
    if (child.parenSpan) extents.push(child.parenSpan);
    negated = !negated;
    child = child.child;
  }
  if (
    child.kind !== "filter" ||
    child.span === undefined ||
    child.span.from < selected.from ||
    child.span.to > selected.to
  )
    return null;
  extents.push(child.span);
  if (child.parenSpan) extents.push(child.parenSpan);
  return {
    filter: child,
    negated,
    span: {
      from: Math.min(...extents.map((extent) => extent.from)),
      to: Math.max(...extents.map((extent) => extent.to)),
    },
  };
}

export function createTokenFacetState(
  query: string,
  span: Span,
  registry: FieldRegistry,
): TokenFacetState | null {
  const { ast } = parse(query, registry);
  if (ast === null) return null;
  const condition = selectedCondition(ast, span);
  if (condition === null) return null;
  const expression = query.slice(condition.span.from, condition.span.to);
  if (!parse(expression, registry).valid) return null;
  const { filter, negated } = condition;
  let operator: CheckboxOperator = "any of";
  if (negated) operator = "none of";
  else if (filter.valueOp === "and") operator = "all of";
  return {
    query,
    span: condition.span,
    expression,
    template: filter,
    operator,
  };
}

function currentFilter(
  state: TokenFacetState,
  registry: FieldRegistry,
): FilterState {
  if (state.expression === null) return [];
  const { ast } = parse(state.expression, registry);
  let filter = ast;
  while (filter?.kind === "not") filter = filter.child;
  if (filter?.kind !== "filter") return [];
  const ref = registry.resolveField(filter.key);
  const array = ref?.type === "field" && ref.field.syncMode === "arrayOption";
  const operator = state.operator;
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

function tokenManagedPolicy(
  state: TokenFacetState,
  registry: FieldRegistry,
  policy: ManagedEnvironmentPolicyConfig | undefined,
) {
  const ref = registry.resolveField(state.template.key);
  if (
    !policy?.hiddenEnvironments.length ||
    ref?.type !== "field" ||
    (ref.field.filterColumn ?? ref.field.id) !== policy.managedEnvironmentColumn
  )
    return undefined;
  const config: ManagedEnvironmentPolicyConfig = {
    managedEnvironmentColumn: state.template.key,
    hiddenEnvironments: policy.hiddenEnvironments.map(
      (value) => ref.field.displayValueByFilterValue?.get(value) ?? value,
    ),
  };
  const managedFilters = astToFilterState(
    parse(state.query, registry).ast,
    undefined,
    registry,
  ).filters.filter(
    (filter) => filter.column === policy.managedEnvironmentColumn,
  );
  // The owning policy only projects a single checkbox condition. Other
  // conditions on this column keep their explicit, token-local meaning.
  const eligible =
    state.expression === null
      ? managedFilters.length === 0
      : managedFilters.length === 1 &&
        managedFilters[0]?.type === "stringOptions";
  return { config, eligible };
}

export function tokenFacetModel(
  state: TokenFacetState,
  observedValues: readonly string[],
  registry: FieldRegistry,
  managedEnvironmentPolicy?: ManagedEnvironmentPolicyConfig,
) {
  const policy = tokenManagedPolicy(state, registry, managedEnvironmentPolicy);
  const managedPolicy = policy?.eligible ? policy.config : undefined;
  let filters = currentFilter(state, registry);
  if (managedPolicy) {
    filters = buildEffectiveEnvironmentFilter({
      explicitFilters: canonicalizeExplicitEnvironmentFilters({
        explicitFilters: filters,
        config: managedPolicy,
      }),
      config: managedPolicy,
    });
  }
  const current = filters[0];
  const options = Array.from(
    new Set([
      ...observedValues,
      ...state.template.values,
      ...(policy?.config.hiddenEnvironments ?? []),
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
    managedPolicy,
  };
}

export function applyTokenFacetAction(
  state: TokenFacetState,
  observedValues: readonly string[],
  action: TokenFacetAction,
  registry: FieldRegistry,
  managedEnvironmentPolicy?: ManagedEnvironmentPolicyConfig,
): TokenFacetState {
  const model = tokenFacetModel(
    state,
    observedValues,
    registry,
    managedEnvironmentPolicy,
  );
  const column = state.template.key;
  const context: SidebarFilterActionContext = {
    ...model.managedPolicy,
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
      if (model.operator === "any of" || model.operator === "all of") {
        next = model.managedPolicy
          ? applyCheckboxSelection(
              context,
              model.filters,
              column,
              model.options,
              "any of",
            )
          : [];
      } else {
        next = applyCheckboxSelection(
          context,
          model.filters,
          column,
          model.options,
        );
      }
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
  const displayed = model.managedPolicy
    ? toSearchBarEnvironmentFilters({
        explicitFilters: canonicalizeExplicitEnvironmentFilters({
          explicitFilters: next,
          config: model.managedPolicy,
        }),
        config: model.managedPolicy,
      })
    : next;
  const nextFilter = displayed[0];
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
      operator: nextFilter.operator,
      span: { from: prefix.length, to: prefix.length + expression.length },
    };
  }
  return {
    ...state,
    expression,
    operator: nextFilter.operator,
    query:
      state.query.slice(0, state.span.from) +
      expression +
      state.query.slice(state.span.to),
    span: { from: state.span.from, to: state.span.from + expression.length },
  };
}
