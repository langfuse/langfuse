// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  EVENTS_FIELD_REGISTRY,
  type FieldRegistry,
  withFieldOptions,
} from "./fields";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import {
  EVALUATOR_FIELD_REGISTRY,
  RULE_SAMPLE_FIELD_REGISTRY,
} from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { SESSIONS_FIELD_REGISTRY } from "@/src/features/filters/config/sessionsSearchRegistry";
import { EXPERIMENTS_FIELD_REGISTRY } from "@/src/features/experiments/constants/experimentsSearchRegistry";
import { validateQuery } from "./validate";
import { planCommit } from "./commit";
import { filterStateToQueryText } from "./filter-state-to-query";
import { planInputCompletions } from "./completions";
import {
  generateQueryCases,
  runSearchBarInvariants,
  type RegistryUnderTest,
} from "./searchBarInvariants";

// Per-view wiring of the property harness. A second filterable view adopts the
// bar by adding its own block here with its registry — the harness is unchanged.
// See README.md "Extending to other views (the universality contract)".
const eventsView: RegistryUnderTest = {
  name: "events v4",
  registry: EVENTS_FIELD_REGISTRY,
  // Grammar overlay: dot-path examples + pseudo-fields (README step 2).
  extraKeys: [
    "metadata.region",
    "scores.accuracy",
    "traceScores.nps",
    // Quoted dot-path segments: score/metadata names with spaces + grammar
    // chars must round-trip through the quoting just like bare keys.
    'scores."Rouge Score"',
    'traceScores."Hallucination Check"',
    'metadata."my key"',
    "has:endTime",
    "has:latency",
  ],
  // Numeric vs categorical routing for scores.accuracy must not change which
  // invariants hold — only how a score lowers.
  scoreContexts: [
    {
      numericScoreNames: new Set(["accuracy"]),
      categoricalScoreNames: new Set(),
      traceNumericScoreNames: new Set(),
      traceCategoricalScoreNames: new Set(["nps"]),
    },
    {
      numericScoreNames: new Set(),
      categoricalScoreNames: new Set(["accuracy"]),
      traceNumericScoreNames: new Set(["nps"]),
      traceCategoricalScoreNames: new Set(),
    },
    // Boolean-observed scores: boolean literals route to booleanObject while
    // numeric shapes keep the legacy scores_avg lowering (old URLs/saved
    // views), so both must hold the invariants under the same context.
    {
      numericScoreNames: new Set(),
      categoricalScoreNames: new Set(),
      booleanScoreNames: new Set(["accuracy"]),
      traceNumericScoreNames: new Set(),
      traceCategoricalScoreNames: new Set(),
      traceBooleanScoreNames: new Set(["nps"]),
    },
  ],
  fieldValues: ["x", "ERROR", "5", "0.8", "2026-06-01", "true", "a b", "gpt-4"],
  // Adversarial free text — the tokens the parser reserves/quotes. The bare
  // boolean keywords and `!`-prefix here are the exact #4 regression class;
  // the bare field words (`type`, `level`) are the LFE-11017 class — a lone
  // field-name free text must serialize QUOTED so it re-parses valid.
  freeTextValues: [
    "hello",
    "refund policy",
    "type",
    "level",
    "or",
    "and",
    "not",
    "OR",
    "AND",
    "NOT",
    "team or kitten",
    "test not really",
    "!important",
    "!critical bug",
    "-foo",
    "a,b",
    "gpt-4-turbo",
    "key:value",
    "(grouped)",
    'has "quote"',
  ],
  sidebarFilters: [
    [
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "verdict",
        operator: "any of",
        value: ["good"],
      },
    ],
    [
      {
        type: "numberObject",
        column: "trace_scores_avg",
        key: "nps",
        operator: ">",
        value: 5,
      },
    ],
  ],
};

const evaluationRulesView: RegistryUnderTest = {
  name: "evaluation rules",
  registry: RULE_FIELD_REGISTRY,
  extraKeys: ["metadata.region", "has:version", "has:parentObservationId"],
  scoreContexts: [],
  fieldValues: ["x", "ERROR", "5", "true", "a b"],
  freeTextValues: [],
};

const withInvariantDatasetOptions = (
  registry: FieldRegistry,
  values: string[],
) =>
  withFieldOptions(
    registry,
    "datasetName",
    values.map((displayValue, index) => ({
      value: `dataset-${index}`,
      displayValue,
    })),
  );

const sampleFilterViews: RegistryUnderTest[] = [
  {
    ...eventsView,
    name: "evaluator sample filters",
    registry: withInvariantDatasetOptions(
      EVALUATOR_FIELD_REGISTRY,
      eventsView.fieldValues,
    ),
  },
  {
    ...evaluationRulesView,
    name: "rule sample filters",
    registry: withInvariantDatasetOptions(
      RULE_SAMPLE_FIELD_REGISTRY,
      evaluationRulesView.fieldValues,
    ),
  },
];

describe.each(sampleFilterViews)(
  "search bar invariants — $name registry",
  (view) => {
    it("holds parity, round-trip, and serialization invariants", () => {
      const failures = runSearchBarInvariants(view);
      expect(
        failures,
        failures.length === 0
          ? "ok"
          : `\n${failures
              .slice(0, 25)
              .map(
                (failure) =>
                  `  [${failure.invariant}] ${failure.case} — ${failure.detail}`,
              )
              .join("\n")}`,
      ).toEqual([]);
    });
  },
);

describe("search bar invariants — events v4 registry", () => {
  it("generates a broad field × operator × value matrix", () => {
    // Sanity: the matrix actually exercises the registry (guards against a
    // future refactor silently emptying the generator).
    expect(generateQueryCases(eventsView).length).toBeGreaterThan(1000);
  });

  it("holds all three invariants (parity, round-trip, serialize symmetry)", () => {
    const failures = runSearchBarInvariants(eventsView);
    // Surface every failing case, not just the first, for a fast diagnosis.
    expect(
      failures,
      failures.length === 0
        ? "ok"
        : `\n${failures
            .slice(0, 25)
            .map((f) => `  [${f.invariant}] ${f.case} — ${f.detail}`)
            .join(
              "\n",
            )}${failures.length > 25 ? `\n  …and ${failures.length - 25} more` : ""}`,
    ).toEqual([]);
  });

  it("supports filtering to experiment item root spans", () => {
    expect(
      planCommit(
        "isExperimentItemRootSpan:true",
        undefined,
        EVENTS_FIELD_REGISTRY,
      ),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "isExperimentItemRootSpan",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
    });
  });

  it("supports the dataset alias used by sample observation filters", () => {
    expect(
      planCommit("dataset:dataset-id", undefined, EVENTS_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-id"],
        },
      ],
    });
  });

  it("filters cached tokens and attributed cached cost", () => {
    expect(
      planCommit(
        "cachedTokens:0 cachedCost:<=0",
        undefined,
        EVENTS_FIELD_REGISTRY,
      ),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "cachedInputTokens",
          type: "number",
          operator: "=",
          value: 0,
        },
        {
          column: "cachedInputCost",
          type: "number",
          operator: "<=",
          value: 0,
        },
      ],
    });
  });

  it("supports presence filters for cached metrics", () => {
    const query =
      "has:cachedTokens -has:cachedTokens has:cachedCost -has:cachedCost";
    expect(
      validateQuery(query, undefined, EVENTS_FIELD_REGISTRY).diagnostics,
    ).toEqual([]);
    expect(planCommit(query, undefined, EVENTS_FIELD_REGISTRY)).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "cachedInputTokens",
          type: "null",
          operator: "is not null",
          value: "",
        },
        {
          column: "cachedInputTokens",
          type: "null",
          operator: "is null",
          value: "",
        },
        {
          column: "cachedInputCost",
          type: "null",
          operator: "is not null",
          value: "",
        },
        {
          column: "cachedInputCost",
          type: "null",
          operator: "is null",
          value: "",
        },
      ],
    });
  });
});

describe("search bar invariants — evaluation rules registry", () => {
  it("isolates the rule language from events-only fields and free text", () => {
    expect(
      validateQuery("latency:>2", undefined, RULE_FIELD_REGISTRY).valid,
    ).toBe(false);
    expect(validateQuery("refund", undefined, RULE_FIELD_REGISTRY).valid).toBe(
      false,
    );

    const completion = planInputCompletions(
      {
        input: "",
        caret: 0,
        observed: {},
        recents: ["latency:>2"],
        currentQueryText: "",
      },
      RULE_FIELD_REGISTRY,
    );
    expect(
      completion?.sections
        .flatMap((section) => section.options)
        .some(
          (option) => option.kind === "field" && option.fieldId === "latency",
        ),
    ).toBe(false);
    expect(
      completion?.sections
        .flatMap((section) => section.options)
        .some((option) => option.kind === "recent"),
    ).toBe(false);

    expect(
      planCommit("tags:billing", undefined, RULE_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [{ column: "tags", type: "arrayOptions" }],
    });

    expect(
      planCommit("model:gpt-4o", undefined, RULE_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [{ column: "providedModelName", type: "string" }],
    });
    expect(
      planCommit("prompt:support-agent", undefined, RULE_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [{ column: "promptName", type: "string" }],
    });
    expect(
      planCommit("status:rate-limit", undefined, RULE_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [{ column: "statusMessage", type: "string" }],
    });
    expect(
      planCommit("experiment:checkout", undefined, RULE_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [{ column: "experimentName", type: "string" }],
    });

    expect(
      planCommit("dataset:dataset-id", undefined, RULE_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-id"],
        },
      ],
    });

    const datasetCompletion = planInputCompletions(
      {
        input: "dataset:",
        caret: 8,
        observed: {
          experimentDatasetId: [{ value: "dataset-id" }],
        },
        recents: [],
        currentQueryText: "dataset:",
      },
      RULE_FIELD_REGISTRY,
    );
    expect(
      datasetCompletion?.sections
        .flatMap((section) => section.options)
        .some(
          (option) => option.kind === "value" && option.value === "dataset-id",
        ),
    ).toBe(true);

    expect(
      planCommit(
        "isExperimentItemRootSpan:true",
        undefined,
        RULE_FIELD_REGISTRY,
      ),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "isExperimentItemRootSpan",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
    });
  });

  it("holds commit parity and FilterState round-trips", () => {
    expect(runSearchBarInvariants(evaluationRulesView)).toEqual([]);
  });
});

const sessionsView: RegistryUnderTest = {
  name: "sessions v4",
  registry: SESSIONS_FIELD_REGISTRY,
  extraKeys: [
    "metadata.region",
    'metadata."my key"',
    "scores.accuracy",
    'scores."Rouge Score"',
    "has:environment",
    "has:userIds",
  ],
  scoreContexts: [
    {
      numericScoreNames: new Set(["accuracy"]),
      categoricalScoreNames: new Set(),
    },
    {
      numericScoreNames: new Set(),
      categoricalScoreNames: new Set(["accuracy"]),
    },
    {
      numericScoreNames: new Set(),
      categoricalScoreNames: new Set(),
      booleanScoreNames: new Set(["accuracy"]),
    },
  ],
  fieldValues: ["x", "default", "5", "0.8", "true", "a b", "user-1"],
  // Free text is rewritten onto `id`, not dropped, so the quoting/reserved-word
  // mirror still has to hold on this registry.
  freeTextValues: ["hello", "refund policy", "or", "and", "!important", "-foo"],
  sidebarFilters: [
    [
      {
        type: "numberObject",
        column: "scores_avg",
        key: "accuracy",
        operator: ">",
        value: 0.5,
      },
    ],
    // Trace scores are not offered here, so this one must stay sidebar-only.
    [
      {
        type: "numberObject",
        column: "trace_scores_avg",
        key: "nps",
        operator: ">",
        value: 5,
      },
    ],
  ],
};

describe("search bar invariants — sessions registry", () => {
  it("holds all three invariants (parity, round-trip, serialize symmetry)", () => {
    const failures = runSearchBarInvariants(sessionsView);
    expect(
      failures,
      failures.length === 0
        ? "ok"
        : `\n${failures
            .slice(0, 25)
            .map((f) => `  [${f.invariant}] ${f.case} — ${f.detail}`)
            .join(
              "\n",
            )}${failures.length > 25 ? `\n  …and ${failures.length - 25} more` : ""}`,
    ).toEqual([]);
  });

  it("exposes the sidebar's facets and nothing else", () => {
    expect(SESSIONS_FIELD_REGISTRY.fields.map((f) => f.id).sort()).toEqual([
      "commentContent",
      "commentCount",
      "countTraces",
      "environment",
      "id",
      "inputCost",
      "inputTokens",
      "outputCost",
      "outputTokens",
      "sessionDuration",
      "tags",
      "totalCost",
      "totalTokens",
      "userIds",
    ]);
    // Events-only fields and columns the sidebar never offers stay unresolvable,
    // so a stray token is a diagnostic rather than a filter the sidebar cannot
    // show or remove.
    for (const key of ["latency", "createdAt", "usage", "bookmarked"]) {
      expect(SESSIONS_FIELD_REGISTRY.resolveField(key)).toBeNull();
    }
  });

  it("keeps the trace-score namespace closed but observation scores open", () => {
    expect(SESSIONS_FIELD_REGISTRY.resolveField("scores.accuracy")).toEqual({
      type: "scores",
      key: "accuracy",
      level: "observation",
    });
    expect(
      SESSIONS_FIELD_REGISTRY.resolveField("traceScores.accuracy"),
    ).toBeNull();
  });

  it("round-trips the all-of array filters sessions users actually apply", () => {
    // `tags all of` (1.2k applies/56d) and `userIds all of` are the two shapes
    // the sessions sidebar produces that no other bar surface exercises.
    for (const column of ["tags", "userIds"]) {
      expect(
        planCommit(`${column}:(a AND b)`, undefined, SESSIONS_FIELD_REGISTRY),
      ).toMatchObject({
        status: "committed",
        filters: [
          {
            column,
            type: "arrayOptions",
            operator: "all of",
            value: ["a", "b"],
          },
        ],
      });
    }
  });

  it("lowers metadata and session id the way the sidebar does", () => {
    expect(
      planCommit("metadata.region:eu", undefined, SESSIONS_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "metadata",
          type: "stringObject",
          key: "region",
          value: "eu",
        },
      ],
    });
    // `id contains` is how every one of the 13.6k session-id filters is applied.
    expect(
      planCommit("id:checkout", undefined, SESSIONS_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "id",
          type: "string",
          operator: "contains",
          value: "checkout",
        },
      ],
    });
  });

  it("rewrites a bare word onto the session id and settles there", () => {
    const first = planCommit("refund", undefined, SESSIONS_FIELD_REGISTRY);
    if (first.status !== "committed") throw new Error(first.status);
    expect(first).toMatchObject({
      status: "committed",
      searchQuery: null,
      filters: [
        { column: "id", type: "string", operator: "contains", value: "refund" },
      ],
    });
    // The canonicalization is visible AND terminal: the echo renders `id:refund`
    // and committing that again produces the identical filter, so the bar does
    // not keep rewriting itself.
    expect(
      filterStateToQueryText(first.filters, undefined, SESSIONS_FIELD_REGISTRY)
        .text,
    ).toBe("id:refund");
    expect(
      planCommit("id:refund", undefined, SESSIONS_FIELD_REGISTRY),
    ).toMatchObject({ status: "committed", filters: first.filters });

    // A dangling dot-prefix must stay an error rather than becoming an id search
    // for the literal text "metadata." — and the message has to name the real
    // problem, since this view does support `metadata.<key>`.
    const dangling = planCommit(
      "metadata.",
      undefined,
      SESSIONS_FIELD_REGISTRY,
    );
    expect(dangling.status).toBe("invalid");
    if (dangling.status !== "invalid") throw new Error("expected invalid");
    expect(
      dangling.diagnostics.some((d) =>
        /add a key after the dot/.test(d.message),
      ),
    ).toBe(true);

    // Quoting it makes it an explicit literal, so it searches ids like any word.
    expect(
      planCommit('"metadata."', undefined, SESSIONS_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "id",
          type: "string",
          operator: "contains",
          value: "metadata.",
        },
      ],
    });
  });

  it("treats a multi-word run as one phrase, not one filter per word", () => {
    // The suggestion offers `id:"test 123"`, so Enter must agree with it. Per
    // word it would AND `id contains test` with `id contains 123` — a query
    // matching neither what was typed nor what was offered.
    const multi = planCommit("test 123", undefined, SESSIONS_FIELD_REGISTRY);
    if (multi.status !== "committed") throw new Error(multi.status);
    expect(multi.filters).toEqual([
      { column: "id", type: "string", operator: "contains", value: "test 123" },
    ]);
    expect(multi.searchQuery).toBeNull();
    // …and it round-trips through the quoting as the same single filter.
    const text = filterStateToQueryText(
      multi.filters,
      undefined,
      SESSIONS_FIELD_REGISTRY,
    ).text;
    expect(text).toBe('id:"test 123"');
    expect(planCommit(text, undefined, SESSIONS_FIELD_REGISTRY)).toMatchObject({
      filters: multi.filters,
    });

    // Words split around a real filter token still coalesce into one phrase.
    const mixed = planCommit(
      "test countTraces:8 123",
      undefined,
      SESSIONS_FIELD_REGISTRY,
    );
    if (mixed.status !== "committed") throw new Error(mixed.status);
    expect(mixed.filters.filter((f) => f.column === "id")).toEqual([
      { column: "id", type: "string", operator: "contains", value: "test 123" },
    ]);
  });

  it("does not offer Ask AI until the view has its own prompt", () => {
    // buildFilterSystemPrompt branches on registry.id and falls back to the
    // EVENTS prompt — events prose, events worked examples. A view without its
    // own branch must not offer AI generation, or the model gets a correct field
    // catalog wrapped in instructions aimed at columns the view lacks.
    expect(SESSIONS_FIELD_REGISTRY.aiFilterPrompt).toBe(false);
    expect(EVENTS_FIELD_REGISTRY.aiFilterPrompt).toBe(true);
    expect(RULE_FIELD_REGISTRY.aiFilterPrompt).toBe(true);
  });

  it("offers only the recent searches that are valid on this view", () => {
    // Recents live in one per-PROJECT store shared with the events bar, so a
    // query typed there can surface here. An events-only one must not be
    // offered: picking it would insert a query that cannot commit.
    const plan = planInputCompletions(
      {
        input: "",
        caret: 0,
        observed: {},
        recents: ["latency:>2", "tags:billing", "level:ERROR", "countTraces:8"],
        currentQueryText: "",
      },
      SESSIONS_FIELD_REGISTRY,
    );
    const offered = (plan?.sections ?? [])
      .flatMap((section) => section.options)
      .filter((option) => option.kind === "recent")
      .map((option) => option.label);
    expect(offered).toEqual(["tags:billing", "countTraces:8"]);

    // Opt-in: a view that has not asked for recents gets none, valid or not.
    expect(RULE_FIELD_REGISTRY.recentSearches).toBe(false);
  });
});

const experimentsView: RegistryUnderTest = {
  name: "experiments",
  registry: EXPERIMENTS_FIELD_REGISTRY,
  extraKeys: ["metadata.owner", 'metadata."my key"'],
  scoreContexts: [],
  fieldValues: ["x", "sonnet", "5", "0.8", "a b"],
  freeTextValues: ["hello", "run 12", "or", "!important"],
  // Scores stay in the sidebar on this view, and after the score unification
  // they sit on the SAME canonical columns the bar's `scores.` path recognizes —
  // so the serializer has to be told they are not the bar's to render.
  sidebarFilters: [
    [
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "verified_article_status",
        operator: "any of",
        value: ["none-verified"],
      },
    ],
    [
      {
        type: "numberObject",
        column: "scores_avg",
        key: "groundedness",
        operator: ">",
        value: 0.5,
      },
    ],
    [
      {
        type: "booleanObject",
        column: "score_booleans",
        key: "in_force",
        operator: "=",
        value: true,
      },
    ],
    // A filter the bar DOES own, alongside one it does not: the owned half must
    // still render.
    [
      {
        type: "stringOptions",
        column: "experimentDatasetName",
        operator: "any of",
        value: ["legal-answer-quality"],
      },
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "verified_article_status",
        operator: "any of",
        value: ["none-verified"],
      },
    ],
  ],
};

describe("search bar invariants — experiments registry", () => {
  it("holds all three invariants (parity, round-trip, serialize symmetry)", () => {
    const failures = runSearchBarInvariants(experimentsView);
    expect(
      failures,
      failures.length === 0
        ? "ok"
        : `\n${failures
            .slice(0, 25)
            .map((f) => `  [${f.invariant}] ${f.case} — ${f.detail}`)
            .join(
              "\n",
            )}${failures.length > 25 ? `\n  …and ${failures.length - 25} more` : ""}`,
    ).toEqual([]);
  });

  it("exposes only the sidebar facets whose columns are actually filterable", () => {
    expect(EXPERIMENTS_FIELD_REGISTRY.fields.map((f) => f.id).sort()).toEqual([
      "experimentDatasetName",
      "name",
    ]);
    // `dataset:` filters by the readable, unique name; the id column stays
    // filterable for old saved views but is not offered here.
    expect(EXPERIMENTS_FIELD_REGISTRY.resolveField("dataset")).toMatchObject({
      type: "field",
      field: { id: "experimentDatasetName" },
    });
    expect(
      EXPERIMENTS_FIELD_REGISTRY.resolveField("experimentDatasetId"),
    ).toBeNull();
  });

  it("keeps score dot-paths closed until the columns are unified", () => {
    // The adapter lowers `scores.<name>` onto the canonical scores_avg /
    // score_categories / score_booleans columns. Experiments names its score
    // columns obs_* / trace_*, so an open `scores.` here would emit a filter on
    // a column this view does not have.
    expect(
      EXPERIMENTS_FIELD_REGISTRY.resolveField("scores.groundedness"),
    ).toBeNull();
    expect(EXPERIMENTS_FIELD_REGISTRY.resolveField("traceScores.x")).toBeNull();
    // Metadata is unaffected — that column exists under its canonical name.
    expect(EXPERIMENTS_FIELD_REGISTRY.resolveField("metadata.owner")).toEqual({
      type: "metadata",
      key: "owner",
    });
  });

  it("rewrites a bare word onto the experiment name", () => {
    const committed = planCommit(
      "refund eval",
      undefined,
      EXPERIMENTS_FIELD_REGISTRY,
    );
    expect(committed).toMatchObject({
      status: "committed",
      searchQuery: null,
      filters: [
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "refund eval",
        },
      ],
    });
  });

  it("keeps the run metrics out — the backend silently drops them", () => {
    // itemCount / errorCount / totalCost / latencyAvg have ColumnDefinitions for
    // display and sorting but no UiColumnMapping, and the repository partitions
    // filters by allow-list, discarding anything in neither group. A field here
    // would render a pill and change nothing.
    for (const id of ["itemCount", "errorCount", "totalCost", "latencyAvg"]) {
      expect(EXPERIMENTS_FIELD_REGISTRY.resolveField(id)).toBeNull();
    }
    expect(EXPERIMENTS_FIELD_REGISTRY.resolveField("cost")).toBeNull();
  });
});
