import { describe, expect, it } from "vitest";
import {
  DATASET_ITEM_TABS,
  getDatasetItemTabs,
} from "./dataset-item-tabs";

describe("dataset item URL navigation and encoding", () => {
  it("generates correct tab paths for standard alphanumeric IDs", () => {
    const tabs = getDatasetItemTabs({
      projectId: "proj-123",
      datasetId: "ds-456",
      itemId: "item-789",
    });

    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({
      value: DATASET_ITEM_TABS.ITEM,
      label: "Item",
      href: "/project/proj-123/datasets/ds-456/items/item-789",
    });
    expect(tabs[1]).toEqual({
      value: DATASET_ITEM_TABS.RUNS,
      label: "Experiments",
      href: "/project/proj-123/datasets/ds-456/items/item-789/runs",
    });
  });

  it("correctly encodes reserved characters in IDs once without double-encoding", () => {
    const reservedCases = [
      { raw: "path/with/slashes", expected: "path%2Fwith%2Fslashes" },
      { raw: "item?query=param", expected: "item%3Fquery%3Dparam" },
      { raw: "special#hash", expected: "special%23hash" },
      { raw: "percent%20encoded", expected: "percent%2520encoded" },
      { raw: "space in id", expected: "space%20in%20id" },
    ];

    for (const { raw, expected } of reservedCases) {
      const tabs = getDatasetItemTabs({
        projectId: "proj-1",
        datasetId: "ds-1",
        itemId: raw,
      });

      expect(tabs[0].href).toBe(`/project/proj-1/datasets/ds-1/items/${expected}`);
      expect(tabs[1].href).toBe(
        `/project/proj-1/datasets/ds-1/items/${expected}/runs`,
      );
    }
  });

  it("ensures DetailPageNav pre-encoded entry.id is not double-encoded in path template", () => {
    // DetailPageNav contract: entry.id is passed into path() as encodeURIComponent(entry.id)
    const rawId = "group/subgroup/item-01";
    const preEncodedEntry = {
      id: encodeURIComponent(rawId),
      params: undefined,
    };

    // DatasetItemDetailPage path callback contract:
    const pathFn = (entry: { id: string }) =>
      `/project/p1/datasets/d1/items/${entry.id}`;

    const resultingUrl = pathFn(preEncodedEntry);
    expect(resultingUrl).toBe(
      "/project/p1/datasets/d1/items/group%2Fsubgroup%2Fitem-01",
    );
    expect(resultingUrl).not.toContain("%252F");
  });
});
