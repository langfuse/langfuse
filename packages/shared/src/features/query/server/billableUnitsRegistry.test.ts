import { describe, expect, it } from "vitest";

import { billableUnitsView } from "../dataModel";
import {
  BILLABLE_UNITS_DIMENSIONS,
  BILLABLE_UNITS_MEASURES,
} from "./billableUnitsRegistry";

// The client reads the view's names from `billableUnitsView`; the AST
// builder reads the expression of the same name from the registry.
describe("billable-units registry", () => {
  it("has an entry for every dimension and measure of the view, in order", () => {
    expect(Object.keys(BILLABLE_UNITS_DIMENSIONS)).toEqual(
      Object.keys(billableUnitsView.dimensions),
    );
    expect(Object.keys(BILLABLE_UNITS_MEASURES)).toEqual(
      Object.keys(billableUnitsView.measures),
    );
  });
});
