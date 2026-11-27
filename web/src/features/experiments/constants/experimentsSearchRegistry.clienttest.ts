// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getExperimentsFilterConfig } from "@/src/features/experiments/components/table/filter-config";
import {
  EXPERIMENTS_FIELD_REGISTRY,
  experimentsFieldRegistry,
} from "./experimentsSearchRegistry";

describe("experimentsFieldRegistry — scoped to the facets it renders", () => {
  it("drops the dataset field when the page pins the dataset", () => {
    // A dataset-scoped page omits the Dataset facet, and the sidebar strips any
    // filter on a facet-less column on write — so offering `dataset:` there
    // would take the token and silently discard it.
    const scoped = experimentsFieldRegistry(
      getExperimentsFilterConfig(["experimentDatasetId"]),
    );

    expect(scoped.resolveField("dataset")).toBeNull();
    expect(scoped.resolveField("experimentDatasetName")).toBeNull();
    expect(scoped.resolveField("name")).not.toBeNull();
  });

  it("stops advertising an example the scoped registry cannot resolve", () => {
    const scoped = experimentsFieldRegistry(
      getExperimentsFilterConfig(["experimentDatasetId"]),
    );

    expect(scoped.searchExamples).not.toContain("dataset:legal-answer-quality");
    expect(scoped.searchExamples).toContain("name:sonnet");
    // The unscoped registry is unchanged: it has the facet, so it keeps it.
    expect(EXPERIMENTS_FIELD_REGISTRY.searchExamples).toContain(
      "dataset:legal-answer-quality",
    );
  });
});
