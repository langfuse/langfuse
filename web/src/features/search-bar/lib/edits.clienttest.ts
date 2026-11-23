// @vitest-environment node

import { describe, expect, it } from "vitest";

import { removeToken } from "./edits";
import { astToFilterState } from "./adapter";
import { EVENTS_FIELD_REGISTRY } from "./fields";
import { parse } from "./langQ";
import {
  applyTokenFacetAction,
  createTokenFacetState,
  tokenFacetModel,
} from "./fns/tokenFacet";
import {
  buildEffectiveEnvironmentFilter,
  canonicalizeExplicitEnvironmentFilters,
} from "../../filters/lib/managedEnvironmentPolicy";
import {
  applyCheckboxSelection,
  buildOnlySelection,
  type SidebarFilterActionContext,
} from "../../filters/lib/sidebar-filter-actions";
import { type FilterState } from "@langfuse/shared";

function spanOf(text: string, token: string) {
  const from = text.indexOf(token);
  return { from, to: from + token.length };
}

describe("removeToken — semantic preservation", () => {
  it("matches managed environment checkbox intent while keeping hidden defaults out of query text", () => {
    const policy = {
      managedEnvironmentColumn: "environment",
      hiddenEnvironments: ["internal", "hidden-outside-options"],
    };
    const observed = ["prod", "stage", "qa", "public", "internal"];
    const options = [...observed, "hidden-outside-options"];
    const expression = "-env:(prod OR stage OR qa)";
    const companion = "-name:=blocked";
    const query = `${expression} ${companion}`;
    const initial = createTokenFacetState(
      query,
      spanOf(query, expression),
      EVENTS_FIELD_REGISTRY,
    )!;
    const context: SidebarFilterActionContext = {
      ...policy,
      facets: [
        { type: "categorical", column: "environment", label: "Environment" },
      ],
      columnDefinitions: [
        {
          id: "environment",
          name: "Environment",
          internal: "environment",
          type: "stringOptions",
          options: [],
        },
      ],
      options: { environment: options },
    };
    const canonicalize = (filters: FilterState) =>
      canonicalizeExplicitEnvironmentFilters({
        explicitFilters: filters,
        config: policy,
      });
    const explicit = (text: string) =>
      canonicalize(astToFilterState(parse(text).ast).filters).filter(
        (filter) => filter.column === "environment",
      );
    const effective = (text: string) =>
      buildEffectiveEnvironmentFilter({
        explicitFilters: explicit(text),
        config: policy,
      });
    const normalized = (filters: FilterState) =>
      filters.map((filter) =>
        filter.type === "stringOptions"
          ? { ...filter, value: [...filter.value].sort() }
          : filter,
      );
    const env = (
      operator: "any of" | "none of",
      value: string[],
    ): FilterState => [
      {
        type: "stringOptions",
        column: "environment",
        operator,
        value: [...value].sort(),
      },
    ];
    const model = tokenFacetModel(
      initial,
      observed,
      EVENTS_FIELD_REGISTRY,
      policy,
    );
    expect(model.options).toEqual(options);
    expect(model.value).toEqual(["public"]);
    expect(normalized(model.filters)).toEqual(
      env("none of", [...policy.hiddenEnvironments, "prod", "stage", "qa"]),
    );
    const justProd = applyTokenFacetAction(
      initial,
      observed,
      { kind: "selection", values: ["stage", "qa", "public"] },
      EVENTS_FIELD_REGISTRY,
      policy,
    );
    expect(normalized(explicit(justProd.query))).toEqual(
      env("none of", [...policy.hiddenEnvironments, "prod"]),
    );
    expect(
      tokenFacetModel(justProd, observed, EVENTS_FIELD_REGISTRY, policy).value,
    ).toEqual(["stage", "qa", "public"]);

    const checked = ["prod", "public"];
    const rechecked = applyTokenFacetAction(
      initial,
      observed,
      { kind: "selection", values: checked },
      EVENTS_FIELD_REGISTRY,
      policy,
    );
    const sidebar = applyCheckboxSelection(
      context,
      effective(query),
      "environment",
      checked,
    );
    expect(normalized(explicit(rechecked.query))).toEqual(
      env("none of", [...policy.hiddenEnvironments, "stage", "qa"]),
    );
    expect(normalized(explicit(rechecked.query))).toEqual(
      normalized(canonicalize(sidebar)),
    );
    expect(rechecked.query).toContain(companion);
    expect(rechecked.query).not.toContain("hidden-outside-options");

    const defaults = applyTokenFacetAction(
      rechecked,
      observed,
      { kind: "selection", values: ["prod", "stage", "qa", "public"] },
      EVENTS_FIELD_REGISTRY,
      policy,
    );
    expect(defaults.query).toBe(companion);
    expect(explicit(defaults.query)).toEqual([]);
    expect(normalized(effective(defaults.query))).toEqual(
      env("none of", policy.hiddenEnvironments),
    );

    const onlyHidden = applyTokenFacetAction(
      initial,
      observed,
      { kind: "only", value: "internal" },
      EVENTS_FIELD_REGISTRY,
      policy,
    );
    const sidebarOnly = buildOnlySelection(
      context,
      effective(query),
      "environment",
      "internal",
    )!;
    const sidebarHidden = applyCheckboxSelection(
      context,
      effective(query),
      "environment",
      sidebarOnly.values,
      sidebarOnly.operator,
    );
    expect(explicit(onlyHidden.query)).toEqual(env("any of", ["internal"]));
    expect(explicit(onlyHidden.query)).toEqual(sidebarHidden);
    const all = applyTokenFacetAction(
      onlyHidden,
      observed,
      { kind: "only", value: "internal" },
      EVENTS_FIELD_REGISTRY,
      policy,
    );
    expect(normalized(explicit(all.query))).toEqual(env("any of", options));
    expect(normalized(explicit(all.query))).toEqual(
      normalized(
        applyCheckboxSelection(context, sidebarHidden, "environment", options),
      ),
    );
    expect(all.query).toContain(companion);
    const reset = applyTokenFacetAction(
      all,
      observed,
      { kind: "clear" },
      EVENTS_FIELD_REGISTRY,
      policy,
    );
    expect(reset.query).toBe(companion);
    expect(normalized(effective(reset.query))).toEqual(
      env("none of", policy.hiddenEnvironments),
    );

    const compoundQuery = `${query} -env:=public`;
    const compound = createTokenFacetState(
      compoundQuery,
      spanOf(compoundQuery, expression),
      EVENTS_FIELD_REGISTRY,
    )!;
    expect(
      tokenFacetModel(compound, observed, EVENTS_FIELD_REGISTRY, policy)
        .filters,
    ).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "none of",
        value: ["prod", "stage", "qa"],
      },
    ]);
    const editedCompound = applyTokenFacetAction(
      compound,
      observed,
      { kind: "only", value: "internal" },
      EVENTS_FIELD_REGISTRY,
      policy,
    );
    expect(editedCompound.query).toContain(companion);
    expect(editedCompound.query).toContain("-env:=public");
    expect(explicit(editedCompound.query)).toEqual([
      ...env("any of", ["internal"]),
      ...env("none of", ["public"]),
    ]);
    const nameQuery = "name:(alpha OR beta OR gamma)";
    const name = createTokenFacetState(
      nameQuery,
      { from: 0, to: nameQuery.length },
      EVENTS_FIELD_REGISTRY,
    )!;
    expect(
      tokenFacetModel(name, [], EVENTS_FIELD_REGISTRY, policy).options,
    ).toEqual(["alpha", "beta", "gamma"]);

    const targetedRegistry = {
      ...EVENTS_FIELD_REGISTRY,
      targeting: {
        defaultTarget: "all",
        supports: () => true,
        targets: [
          { id: "all", label: "All", keyword: true },
          { id: "run-a", label: "Run A" },
        ],
      },
    };
    const targetedExpression = '-"Run A".env:(prod OR stage OR qa)';
    const targetedQuery = `${targetedExpression} ${companion}`;
    const targeted = createTokenFacetState(
      targetedQuery,
      spanOf(targetedQuery, targetedExpression),
      targetedRegistry,
    )!;
    const editedTarget = applyTokenFacetAction(
      targeted,
      observed,
      { kind: "selection", values: checked },
      targetedRegistry,
      policy,
    );
    expect(editedTarget.query).toContain(companion);
    expect(
      astToFilterState(
        parse(editedTarget.query, targetedRegistry).ast,
        undefined,
        targetedRegistry,
      ).filters.find((filter) => filter.column === "environment"),
    ).toEqual({
      type: "stringOptions",
      column: "environment",
      operator: "none of",
      value: ["stage", "qa"],
      target: "run-a",
    });
  });

  it("clears only its positive condition when the singleton All action is chosen", () => {
    for (const expression of [
      "name:(alpha OR beta OR gamma)",
      "tags:(alpha AND beta AND gamma)",
    ]) {
      const companion = "-name:=blocked";
      const query = `${expression} ${companion}`;
      const initial = createTokenFacetState(
        query,
        spanOf(query, expression),
        EVENTS_FIELD_REGISTRY,
      )!;
      const singleton = applyTokenFacetAction(
        initial,
        [],
        { kind: "selection", values: ["alpha"] },
        EVENTS_FIELD_REGISTRY,
      );
      const all = applyTokenFacetAction(
        singleton,
        [],
        { kind: "only", value: "alpha" },
        EVENTS_FIELD_REGISTRY,
      );
      expect(all.query).toBe(companion);
      expect(all.expression).toBeNull();
    }
  });

  it("applies Only to the complete negated condition in keyword and dash forms", () => {
    const token = "name:(alpha OR beta OR gamma)";
    for (const expression of [
      `-${token}`,
      `NOT ${token}`,
      `NOT (${token})`,
      `NOT NOT -${token}`,
    ]) {
      const query = `level:ERROR ${expression} env:dev`;
      const initial = createTokenFacetState(
        query,
        spanOf(query, token),
        EVENTS_FIELD_REGISTRY,
      )!;
      const next = applyTokenFacetAction(
        initial,
        [],
        { kind: "only", value: "beta" },
        EVENTS_FIELD_REGISTRY,
      );
      const parsed = parse(next.query);
      expect(parsed.valid).toBe(true);
      expect(astToFilterState(parsed.ast).filters).toEqual([
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR"],
        },
        {
          type: "stringOptions",
          column: "name",
          operator: "any of",
          value: ["beta"],
        },
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["dev"],
        },
      ]);
    }
  });

  it("keeps all-of mode when an array group shrinks to one value and grows again", () => {
    const query = "tags:(alpha AND beta AND gamma)";
    const initial = createTokenFacetState(
      query,
      { from: 0, to: query.length },
      EVENTS_FIELD_REGISTRY,
    )!;
    const singleton = applyTokenFacetAction(
      initial,
      [],
      { kind: "selection", values: ["alpha"] },
      EVENTS_FIELD_REGISTRY,
    );
    const expanded = applyTokenFacetAction(
      singleton,
      [],
      { kind: "selection", values: ["alpha", "beta"] },
      EVENTS_FIELD_REGISTRY,
    );
    expect(astToFilterState(parse(expanded.query).ast).filters).toEqual([
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "all of",
        value: ["alpha", "beta"],
      },
    ]);
  });

  it("preserves an explicit ID list when its last unchecked known value is reselected", () => {
    const query = "id:(first-id OR second-id OR third-id)";
    const state = createTokenFacetState(
      query,
      { from: 0, to: query.length },
      EVENTS_FIELD_REGISTRY,
    )!;
    const unchecked = applyTokenFacetAction(
      state,
      [],
      { kind: "selection", values: ["first-id", "second-id"] },
      EVENTS_FIELD_REGISTRY,
    );
    const rechecked = applyTokenFacetAction(
      unchecked,
      [],
      { kind: "selection", values: ["first-id", "second-id", "third-id"] },
      EVENTS_FIELD_REGISTRY,
    );
    expect(astToFilterState(parse(rechecked.query).ast).filters).toEqual([
      {
        type: "stringOptions",
        column: "id",
        operator: "any of",
        value: ["first-id", "second-id", "third-id"],
      },
    ]);
  });

  it("edits only the clicked exclusion while keeping companion filters", () => {
    const expression = "-name:(old-a OR old-b OR old-c)";
    const query = `name:(keep-a OR keep-b OR keep-c) ${expression} tags:production`;
    const state = createTokenFacetState(
      query,
      spanOf(query, expression),
      EVENTS_FIELD_REGISTRY,
    )!;
    const next = applyTokenFacetAction(
      state,
      ["available"],
      { kind: "selection", values: ["available", "old-a"] },
      EVENTS_FIELD_REGISTRY,
    );
    const lowered = astToFilterState(parse(next.query).ast);
    expect(lowered.errors).toEqual([]);
    expect(lowered.filters).toEqual([
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["keep-a", "keep-b", "keep-c"],
      },
      {
        type: "stringOptions",
        column: "name",
        operator: "none of",
        value: ["old-b", "old-c"],
      },
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "any of",
        value: ["production"],
      },
    ]);
  });

  it("keeps exact set matching when a value group shrinks to one", () => {
    for (const [prefix, operator] of [
      ["", "any of"],
      ["-", "none of"],
    ] as const) {
      const query = `${prefix}name:(alpha OR beta OR gamma)`;
      const state = createTokenFacetState(
        query,
        { from: 0, to: query.length },
        EVENTS_FIELD_REGISTRY,
      )!;
      const next = applyTokenFacetAction(
        state,
        [],
        {
          kind: "selection",
          values: prefix === "-" ? ["beta", "gamma"] : ["alpha"],
        },
        EVENTS_FIELD_REGISTRY,
      );
      const lowered = astToFilterState(parse(next.query).ast);
      expect(lowered.errors).toEqual([]);
      expect(lowered.filters).toEqual([
        { type: "stringOptions", column: "name", operator, value: ["alpha"] },
      ]);
    }
  });

  // A bare parse check is not enough: removing `level:ERROR` from
  // `NOT level:ERROR env:dev` splices to `NOT env:dev`, which parses fine but
  // re-binds the stranded NOT keyword onto env:dev and silently inverts its
  // polarity. The removal must collapse the orphaned NOT instead.
  it("collapses a stranded NOT keyword instead of re-binding it to the neighbor", () => {
    const text = "NOT level:ERROR env:dev";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("env:dev");
  });

  it("removes the whole dash-form negation pill", () => {
    const text = "-level:ERROR env:dev";
    expect(removeToken(text, spanOf(text, "-level:ERROR"))).toBe("env:dev");
  });

  it("keeps a surviving invalid `-foo` as-is instead of stripping the dash", () => {
    // `-foo` is an invalid free-text negation. Removing the neighbor must leave
    // `-foo` exactly (still red), NOT silently canonicalize to `foo` and commit
    // a free-text search the user never confirmed.
    const text = "-foo level:ERROR";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("-foo");
    const text2 = "level:ERROR -foo";
    expect(removeToken(text2, spanOf(text2, "level:ERROR"))).toBe("-foo");
  });

  it("splices a plain adjacent filter, preserving the neighbor unchanged", () => {
    const text = "level:ERROR env:dev";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("env:dev");
  });

  it("keeps a negated neighbor negated when removing an earlier filter", () => {
    const text = "level:ERROR -env:dev";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("-env:dev");
  });

  // A coalesced free-text chip spans several text leaves; its × target span
  // matches none of them exactly, so removal must drop the contained leaves.
  it("removes a multi-word free-text chip as one unit", () => {
    expect(
      removeToken("refund policy", spanOf("refund policy", "refund policy")),
    ).toBe("");
    const text = "level:ERROR refund policy";
    expect(removeToken(text, spanOf(text, "refund policy"))).toBe(
      "level:ERROR",
    );
  });

  // An invalid `-foo` free-text-negation chip: the × target token span includes
  // the leading dash, but the inner text leaf's span does not — removal must
  // still drop the whole token, not strip the dash and keep `foo`.
  it("removes an invalid -word negation chip whole, not just the dash", () => {
    expect(removeToken("-foo", spanOf("-foo", "-foo"))).toBe("");
    const text = "level:ERROR -foo";
    expect(removeToken(text, spanOf(text, "-foo"))).toBe("level:ERROR");
  });
});
