import { type FilterState } from "@langfuse/shared";
import {
  clearPendingPresetEdit,
  getPendingPresetEdit,
  openPresetInDashboardCopy,
} from "./homePresetNavigation";

it("carries resolved Home filters only into the first editor on the chosen copy", async () => {
  const range = {
    from: new Date("2026-01-01T00:00:00Z"),
    to: new Date("2026-01-02T00:00:00Z"),
  };
  const filterState: FilterState = [
    { column: "Trace Name", type: "string", operator: "=", value: "checkout" },
    {
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: ["production"],
    },
  ];
  const preview = { dateRange: range, filterState, readPath: "v4" as const };
  const push = vi.fn().mockResolvedValue(true);
  await openPresetInDashboardCopy(
    { push },
    {
      projectId: "project",
      dashboardId: "copy",
      preset: {
        source: { placementId: "card", presetId: "home-traces" },
        selection: {},
      },
      preview,
    },
  );

  expect(getPendingPresetEdit("project", "other")).toBeUndefined();
  const pending = getPendingPresetEdit("project", "copy");
  expect(pending?.preview).toEqual(preview);
  expect(push.mock.calls[0]?.[0].query).toEqual({
    projectId: "project",
    dashboardId: "copy",
    dateRange: `${range.from.getTime()}-${range.to.getTime()}`,
  });
  clearPendingPresetEdit(pending!);
  expect(getPendingPresetEdit("project", "copy")).toBeUndefined();
});
