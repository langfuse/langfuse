import { type FilterState } from "@langfuse/shared";
import {
  buildEffectiveEnvironmentFilter,
  buildImplicitEnvironmentFilter,
  buildManagedEnvironmentPolicyConfig,
  stripImplicitEnvironmentFilterFromExplicitState,
} from "./managedEnvironmentPolicy";
import {
  DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
  EXPERIMENT_ENVIRONMENTS,
  EXPERIMENT_FILTER_COLUMNS,
} from "../constants/internal-environments";
import { eventsTableCols } from "@langfuse/shared";

const HIDDEN = [
  "langfuse-prompt-experiment",
  "langfuse-llm-as-a-judge",
  "langfuse-code-eval",
  "sdk-experiment",
];
const EXPERIMENT_ENVS = ["sdk-experiment", "langfuse-prompt-experiment"];
const LIFTED = ["langfuse-llm-as-a-judge", "langfuse-code-eval"];

const config = buildManagedEnvironmentPolicyConfig({
  hiddenEnvironments: HIDDEN,
  experimentFilterColumns: ["experimentName", "Experiment Name"],
  experimentEnvironments: EXPERIMENT_ENVS,
});

const experimentNameFilter = (
  operator: "any of" | "none of",
): FilterState[number] => ({
  column: "experimentName",
  type: "stringOptions",
  operator,
  value: ["my-run"],
});

const envNoneOf = (value: string[]): FilterState[number] => ({
  column: "environment",
  type: "stringOptions",
  operator: "none of",
  value,
});

describe("managedEnvironmentPolicy — experiment filters reveal experiment environments (LFE-10644)", () => {
  describe("buildImplicitEnvironmentFilter", () => {
    it("hides all configured environments when no experiment filter is present", () => {
      const result = buildImplicitEnvironmentFilter({
        explicitFilters: [],
        config,
      });
      expect(result).toEqual([envNoneOf(HIDDEN)]);
    });

    it("lifts experiment environments when a positive experiment filter is active", () => {
      const result = buildImplicitEnvironmentFilter({
        explicitFilters: [experimentNameFilter("any of")],
        config,
      });
      expect(result).toEqual([envNoneOf(LIFTED)]);
    });

    it("recognizes experiment intent via the display-name column form", () => {
      const result = buildImplicitEnvironmentFilter({
        explicitFilters: [
          {
            column: "Experiment Name",
            type: "stringOptions",
            operator: "any of",
            value: ["my-run"],
          },
        ],
        config,
      });
      expect(result).toEqual([envNoneOf(LIFTED)]);
    });

    it("recognizes experiment intent via a sidebar text filter (string contains)", () => {
      const result = buildImplicitEnvironmentFilter({
        explicitFilters: [
          {
            column: "experimentName",
            type: "string",
            operator: "contains",
            value: "demo",
          },
        ],
        config,
      });
      expect(result).toEqual([envNoneOf(LIFTED)]);
    });

    it("keeps the full exclusion for negative experiment filters", () => {
      const result = buildImplicitEnvironmentFilter({
        explicitFilters: [experimentNameFilter("none of")],
        config,
      });
      expect(result).toEqual([envNoneOf(HIDDEN)]);
    });

    it("emits no filter when experiment intent reveals every hidden environment", () => {
      const allExperimentConfig = buildManagedEnvironmentPolicyConfig({
        hiddenEnvironments: EXPERIMENT_ENVS,
        experimentFilterColumns: ["experimentName"],
        experimentEnvironments: EXPERIMENT_ENVS,
      });
      const result = buildImplicitEnvironmentFilter({
        explicitFilters: [experimentNameFilter("any of")],
        config: allExperimentConfig,
      });
      expect(result).toEqual([]);
    });

    it("still yields to an explicit environment filter", () => {
      const result = buildImplicitEnvironmentFilter({
        explicitFilters: [
          experimentNameFilter("any of"),
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
        ],
        config,
      });
      expect(result).toEqual([]);
    });
  });

  describe("stripImplicitEnvironmentFilterFromExplicitState", () => {
    it("strips the full system-shaped exclusion", () => {
      const result = stripImplicitEnvironmentFilterFromExplicitState({
        explicitFilters: [envNoneOf(HIDDEN)],
        config,
      });
      expect(result).toEqual([]);
    });

    it("strips the lifted system-shaped exclusion (round-trip while experiment filter active)", () => {
      // updateFilter feeds EFFECTIVE state (which carries the lifted implicit
      // filter) back into setFilterState; the lifted shape must strip like the
      // full shape or it leaks into persisted explicit state.
      const result = stripImplicitEnvironmentFilterFromExplicitState({
        explicitFilters: [experimentNameFilter("any of"), envNoneOf(LIFTED)],
        config,
      });
      expect(result).toEqual([experimentNameFilter("any of")]);
    });

    it("strips the lifted shape even after the experiment filter was removed", () => {
      const result = stripImplicitEnvironmentFilterFromExplicitState({
        explicitFilters: [envNoneOf(LIFTED)],
        config,
      });
      expect(result).toEqual([]);
    });

    it("keeps a user-authored positive environment selection", () => {
      const userFilter: FilterState = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: HIDDEN,
        },
      ];
      const result = stripImplicitEnvironmentFilterFromExplicitState({
        explicitFilters: userFilter,
        config,
      });
      expect(result).toEqual(userFilter);
    });

    it("keeps a custom none-of selection that matches neither system shape", () => {
      const userFilter: FilterState = [envNoneOf(["langfuse-llm-as-a-judge"])];
      const result = stripImplicitEnvironmentFilterFromExplicitState({
        explicitFilters: userFilter,
        config,
      });
      expect(result).toEqual(userFilter);
    });
  });

  describe("buildEffectiveEnvironmentFilter", () => {
    it("applies the lifted implicit exclusion when an experiment filter is active", () => {
      const result = buildEffectiveEnvironmentFilter({
        explicitFilters: [experimentNameFilter("any of")],
        config,
      });
      expect(result).toEqual([envNoneOf(LIFTED)]);
    });

    it("re-canonicalizes a materialized system-shaped exclusion under experiment intent", () => {
      // A shared URL can carry the request-time effective filter, including
      // the system default exclusion. It must adapt to experiment intent like
      // the implicit default instead of making the filter unsatisfiable.
      const result = buildEffectiveEnvironmentFilter({
        explicitFilters: [experimentNameFilter("any of"), envNoneOf(HIDDEN)],
        config,
      });
      expect(result).toEqual([envNoneOf(LIFTED)]);
    });

    it("leaves a user-authored environment selection untouched under experiment intent", () => {
      const userEnvFilter: FilterState[number] = {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      };
      const result = buildEffectiveEnvironmentFilter({
        explicitFilters: [experimentNameFilter("any of"), userEnvFilter],
        config,
      });
      expect(result).toEqual([userEnvFilter]);
    });

    it("passes the system-shaped exclusion through unchanged without experiment intent", () => {
      const result = buildEffectiveEnvironmentFilter({
        explicitFilters: [envNoneOf(HIDDEN)],
        config,
      });
      expect(result).toEqual([envNoneOf(HIDDEN)]);
    });
  });

  describe("default config parity", () => {
    it("keeps EXPERIMENT_FILTER_COLUMNS in sync with the events table experiment columns", () => {
      const experimentCols = eventsTableCols.filter((col) =>
        col.id.startsWith("experiment"),
      );
      expect(experimentCols.length).toBeGreaterThan(0);
      for (const col of experimentCols) {
        expect(EXPERIMENT_FILTER_COLUMNS).toContain(col.id);
        expect(EXPERIMENT_FILTER_COLUMNS).toContain(col.name);
      }
    });

    it("only reveals environments that are hidden by default", () => {
      for (const env of EXPERIMENT_ENVIRONMENTS) {
        expect(
          DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG.hiddenEnvironments,
        ).toContain(env);
      }
    });
  });
});
