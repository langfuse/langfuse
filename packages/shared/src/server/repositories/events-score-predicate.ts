/**
 * Lowers score conditions of the events source (`scores_avg`,
 * `score_categories`, `score_booleans` and their `trace_` variants) to Kysely
 * conditions over the score aggregates an events row selection joins: `s`,
 * the observation scores, and `ts`, the trace scores
 * ({@link ScoreAggregatesExpressionBuilder}). Rejects a condition on any other
 * field with `QueryCompileError` (the caller sorts score fields apart), and a
 * condition type the field does not take with `InvalidRequestError`. Every
 * score field takes `null`.
 *
 * The observation-score fields are level-agnostic: a condition on one matches
 * a score at observation (`s`) or trace (`ts`) level, so a trace-level score,
 * which only lands in `ts`, still matches a filter on the unified Scores
 * column. The `trace_` fields read `ts` only.
 */
import {
  expressionBuilder,
  type Expression,
  type ExpressionBuilder,
  type SqlBool,
} from "kysely";

import { InvalidRequestError } from "../../errors/InvalidRequestError";
import type { PredicateCondition } from "../../query-ast/predicate";
import {
  eventsPredicateSource,
  type PredicateSourceField,
  resolvePredicateSourceField,
} from "../../query-ast/sources";
import { QueryCompileError } from "../query-ast/errors";
import {
  arrayFilter,
  empty,
  has,
  hasAny,
  literal,
  tupleElement,
  typedValue,
} from "../query-ast/extensions";

/** A boolean expression for a WHERE clause. */
type Condition = Expression<SqlBool>;

/**
 * The columns a score aggregate CTE exposes to the WHERE: `scores_avg`, one
 * `(name, avg_value, data_type, string_value)` tuple per numeric or boolean
 * score; `score_categories`, `'<name>:<value>'` per categorical or text
 * score; `score_booleans`, {@link encodeBooleanScoreEntry} per boolean score.
 */
type ScoreAggregateColumns = {
  scores_avg: [string, number, string, string | null][];
  score_categories: string[];
  score_booleans: string[];
};

/**
 * The expression builder of a query that joins the observation score
 * aggregate as `s` and the trace score aggregate as `ts`, both with
 * {@link ScoreAggregateColumns}: the builder of `events as e left join
 * scores_agg as s … left join trace_scores_agg as ts …` fits, one without `ts`
 * does not. It checks these aliases and columns, not the rest of the query.
 */
export type ScoreAggregatesExpressionBuilder = ExpressionBuilder<
  { s: ScoreAggregateColumns; ts: ScoreAggregateColumns },
  "s" | "ts"
>;

/** Combines values the query's builder built; reads no relation itself. */
const ops = expressionBuilder<Record<string, never>, never>();

/** Score condition types, in error-message order. */
const SCORE_CONDITION_TYPES = [
  "numberObject",
  "categoryOptions",
  "booleanObject",
] as const;
/** The condition types a score field takes, one per field. */
type ScoreConditionType = (typeof SCORE_CONDITION_TYPES)[number];

/** A condition of one of the {@link ScoreConditionType}s. */
type ScoreCondition = Extract<PredicateCondition, { type: ScoreConditionType }>;

const isScoreCondition = (
  condition: PredicateCondition,
): condition is ScoreCondition =>
  (SCORE_CONDITION_TYPES as readonly string[]).includes(condition.type);

/** A score aggregate an events row selection joins. */
type ScoreRelation = "s" | "ts";

/** A {@link SCORE_FIELDS} entry. */
type ScoreField = {
  column: keyof ScoreAggregateColumns;
  relations: ReadonlyArray<ScoreRelation>;
};

/**
 * A score field, by events source field id: the aggregate column it reads,
 * and the score aggregates, its own level first: both levels for the
 * observation-score fields, `ts` for the `trace_` fields. Condition types and
 * operators are checked against the resolved source field.
 */
const SCORE_FIELDS: Record<string, ScoreField> = {
  scores_avg: { column: "scores_avg", relations: ["s", "ts"] },
  score_categories: { column: "score_categories", relations: ["s", "ts"] },
  score_booleans: { column: "score_booleans", relations: ["s", "ts"] },
  trace_scores_avg: { column: "scores_avg", relations: ["ts"] },
  trace_score_categories: { column: "score_categories", relations: ["ts"] },
  trace_score_booleans: { column: "score_booleans", relations: ["ts"] },
};

const NUMBER_BIND_TYPE = "Decimal128(12)";

/**
 * Encodes one boolean-score entry the way the `score_booleans` aggregate
 * stores it (`concat(name, ':', lowerUTF8(string_value))`). The SQL filters
 * and `InMemoryFilterService` build lookup targets through it, so the filter
 * paths and the producer cannot drift apart.
 */
export const encodeBooleanScoreEntry = (key: string, value: boolean): string =>
  `${key}:${value ? "true" : "false"}`;

/**
 * `condition`, a score condition of the events source, over `s` and `ts`.
 * An observation-score condition is the union of the condition on `s` and on
 * `ts`: OR for an existence check (numeric operators, `any of`, boolean `=`),
 * AND for an exclusion (`none of`, boolean `<>`), since a score must be
 * missing at both levels (De Morgan), not at one.
 */
export const lowerEventsScoreCondition = (
  eb: ScoreAggregatesExpressionBuilder,
  condition: PredicateCondition,
): Condition => {
  const { field, column, relations } = scoreFieldOf(condition);
  if (condition.type === "null") {
    return lowerNullOn(eb, relations[0], column, condition.op);
  }
  const scoreCondition = scoreConditionOf(field, condition);
  if (relations.length === 1) {
    return lowerOn(eb, relations[0], scoreCondition);
  }
  const exclusion =
    (scoreCondition.type === "categoryOptions" &&
      scoreCondition.op === "none of") ||
    (scoreCondition.type === "booleanObject" && scoreCondition.op === "<>");
  const levels = relations.map((relation) =>
    ops.parens(lowerOn(eb, relation, scoreCondition)),
  );
  return exclusion ? ops.and(levels) : ops.or(levels);
};

/**
 * The score field `condition` names, with its {@link SCORE_FIELDS} entry.
 * Throws `QueryCompileError` for a field that is not a score field (a caller
 * bug: callers pass score filters only).
 */
function scoreFieldOf(
  condition: PredicateCondition,
): ScoreField & { field: PredicateSourceField } {
  const field = resolvePredicateSourceField(
    eventsPredicateSource,
    condition.field.id,
  );
  const scoreField = field === undefined ? undefined : SCORE_FIELDS[field.id];
  if (field === undefined || scoreField === undefined) {
    throw new QueryCompileError(
      `'${condition.field.id}' is not a score field of the events source.`,
    );
  }
  return { field, ...scoreField };
}

/**
 * `condition` on `field` narrowed to a {@link ScoreCondition}. Throws
 * `InvalidRequestError` for a condition type or operator the field does not
 * take (a user filter, e.g. `stringOptions` on `score_categories`).
 */
function scoreConditionOf(
  field: PredicateSourceField,
  condition: PredicateCondition,
): ScoreCondition {
  // `isScoreCondition` also rejects `stringOptions`, which the source accepts
  // on categorical fields but `lowerOn` cannot lower.
  if (
    !isScoreCondition(condition) ||
    !field.operators[condition.type]?.includes(condition.op)
  ) {
    throw new InvalidRequestError(
      `Invalid filter '${condition.type}' with operator '${condition.op}' for column '${condition.field.id}'. The column takes ${acceptedConditionsOf(field)}.`,
    );
  }
  return condition;
}

/** The score condition types `field` takes, each with its operators. */
function acceptedConditionsOf(field: PredicateSourceField): string {
  return SCORE_CONDITION_TYPES.flatMap((type) => {
    const operators = field.operators[type];
    return operators ? [`'${type}' (${operators.join(", ")})`] : [];
  }).join(", ");
}

/**
 * A `null` condition with operator `op` on `column` of the score aggregate
 * `relation`. The left-joined score arrays are `[]`, never NULL, so `is null`
 * excludes every row and `is not null` is a no-op. Rendered as the events
 * list renders it, on the field's own aggregate only; becomes `empty` /
 * `notEmpty` once the events list compiles through this lowering too.
 */
function lowerNullOn(
  eb: ScoreAggregatesExpressionBuilder,
  relation: ScoreRelation,
  column: keyof ScoreAggregateColumns,
  op: Extract<PredicateCondition, { type: "null" }>["op"],
): Condition {
  return ops(
    eb.ref(`${relation}.${column}`),
    op === "is null" ? "is" : "is not",
    null,
  );
}

/** `condition` on the score aggregate `relation`. */
function lowerOn(
  eb: ScoreAggregatesExpressionBuilder,
  relation: ScoreRelation,
  condition: ScoreCondition,
): Condition {
  switch (condition.type) {
    case "numberObject":
      // empty(arrayFilter(x -> x.1 = <key> and x.2 <op> <value>, scores_avg)) = 0
      return ops(
        empty(
          arrayFilter(
            (score) =>
              ops.and([
                ops(
                  tupleElement(score, "1"),
                  "=",
                  typedValue(condition.field.key, "String"),
                ),
                ops(
                  tupleElement(score, "2"),
                  condition.op,
                  typedValue(condition.value, NUMBER_BIND_TYPE),
                ),
              ]),
            eb.ref(`${relation}.scores_avg`),
          ),
        ),
        "=",
        literal(0),
      );
    case "categoryOptions": {
      const matches = hasAny(
        eb.ref(`${relation}.score_categories`),
        typedValue(
          condition.value.map((value) => `${condition.field.key}:${value}`),
          "Array(String)",
        ),
      );
      return condition.op === "none of" ? ops.not(matches) : matches;
    }
    case "booleanObject": {
      const matches = has(
        eb.ref(`${relation}.score_booleans`),
        typedValue(
          encodeBooleanScoreEntry(condition.field.key, condition.value),
          "String",
        ),
      );
      return condition.op === "<>" ? ops.not(matches) : matches;
    }
  }
}
