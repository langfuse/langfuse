import { describe, expect, it } from "vitest";

import {
  FilterList,
  NullFilter,
  NumberFilter,
  StringFilter,
  StringOptionsFilter,
} from "./clickhouse-filter";
import {
  isSeekEligibleFilter,
  scoreOnlyFiltersAreSeekEligible,
} from "./score-seek-eligibility";

const projectIdFilter = () =>
  new StringFilter({
    clickhouseTable: "scores",
    field: "project_id",
    operator: "=",
    value: "p1",
  });

const traceIdEq = (value = "trace-1") =>
  new StringFilter({
    clickhouseTable: "scores",
    field: "trace_id",
    operator: "=",
    value,
    tablePrefix: "s",
  });

const observationIdEq = (value: string, emptyEqualsNull = true) =>
  new StringFilter({
    clickhouseTable: "scores",
    field: "observation_id",
    operator: "=",
    value,
    tablePrefix: "s",
    emptyEqualsNull,
  });

const observationIdIn = (values: string[], emptyEqualsNull = true) =>
  new StringOptionsFilter({
    clickhouseTable: "scores",
    field: "observation_id",
    operator: "any of",
    values,
    tablePrefix: "s",
    emptyEqualsNull,
  });

const nameIn = (values: string[]) =>
  new StringOptionsFilter({
    clickhouseTable: "scores",
    field: "name",
    operator: "any of",
    values,
    tablePrefix: "s",
  });

const idEq = (value = "id-1") =>
  new StringFilter({
    clickhouseTable: "scores",
    field: "id",
    operator: "=",
    value,
    tablePrefix: "s",
  });

const nameEq = (value = "accuracy") =>
  new StringFilter({
    clickhouseTable: "scores",
    field: "name",
    operator: "=",
    value,
    tablePrefix: "s",
  });

const environmentNoneOf = () =>
  new StringOptionsFilter({
    clickhouseTable: "scores",
    field: "environment",
    operator: "none of",
    values: ["default"],
    tablePrefix: "s",
  });

const valueRange = () =>
  new NumberFilter({
    clickhouseTable: "scores",
    field: "value",
    operator: ">",
    value: 0.5,
    tablePrefix: "s",
  });

describe("isSeekEligibleFilter", () => {
  it("accepts = on id / trace_id / name", () => {
    expect(isSeekEligibleFilter(idEq())).toBe(true);
    expect(isSeekEligibleFilter(traceIdEq())).toBe(true);
    expect(isSeekEligibleFilter(nameEq())).toBe(true);
  });

  it("accepts IN on name / observation_id (no empty member)", () => {
    expect(isSeekEligibleFilter(nameIn(["accuracy"]))).toBe(true);
    expect(isSeekEligibleFilter(observationIdIn(["obs-1", "obs-2"]))).toBe(
      true,
    );
  });

  it("accepts a non-empty observation_id = despite emptyEqualsNull", () => {
    // A non-empty value does not trigger the OR IS NULL branch.
    expect(isSeekEligibleFilter(observationIdEq("obs-1"))).toBe(true);
  });

  it("rejects the emptyEqualsNull OR IS NULL degradations", () => {
    // observation_id = '' compiles to (... OR observation_id IS NULL).
    expect(isSeekEligibleFilter(observationIdEq(""))).toBe(false);
    // observation_id IN ('', ...) adds an OR IS NULL branch.
    expect(isSeekEligibleFilter(observationIdIn(["", "obs-1"]))).toBe(false);
  });

  it("rejects an empty IN set", () => {
    expect(isSeekEligibleFilter(nameIn([]))).toBe(false);
  });

  it("rejects non-index columns and non-equality operators", () => {
    expect(isSeekEligibleFilter(environmentNoneOf())).toBe(false);
    expect(isSeekEligibleFilter(valueRange())).toBe(false);
    // project_id equality exists on every query but is not a seek driver.
    expect(isSeekEligibleFilter(projectIdFilter())).toBe(false);
  });

  it("rejects trace_id 'contains' (not an index-prunable operator)", () => {
    expect(
      isSeekEligibleFilter(
        new StringFilter({
          clickhouseTable: "scores",
          field: "trace_id",
          operator: "contains",
          value: "trace",
          tablePrefix: "s",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a null filter on an index column", () => {
    expect(
      isSeekEligibleFilter(
        new NullFilter({
          clickhouseTable: "scores",
          field: "observation_id",
          operator: "is null",
          tablePrefix: "s",
          emptyEqualsNull: true,
        }),
      ),
    ).toBe(false);
  });
});

describe("scoreOnlyFiltersAreSeekEligible", () => {
  it("is eligible when trace_id = is ANDed with a non-prunable observation OR-null sibling", () => {
    const filters = new FilterList([
      projectIdFilter(),
      traceIdEq(),
      observationIdIn(["", "obs-1"]), // not prunable on its own
    ]);
    expect(scoreOnlyFiltersAreSeekEligible(filters)).toBe(true);
  });

  it("is ineligible for environment-only / value-range filters", () => {
    expect(
      scoreOnlyFiltersAreSeekEligible(
        new FilterList([projectIdFilter(), environmentNoneOf()]),
      ),
    ).toBe(false);
    expect(
      scoreOnlyFiltersAreSeekEligible(
        new FilterList([projectIdFilter(), valueRange()]),
      ),
    ).toBe(false);
  });

  it("is ineligible for the bare project filter (no user predicate)", () => {
    expect(
      scoreOnlyFiltersAreSeekEligible(new FilterList([projectIdFilter()])),
    ).toBe(false);
  });
});
