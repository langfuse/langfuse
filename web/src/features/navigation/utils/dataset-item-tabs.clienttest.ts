// @vitest-environment node

import { getDatasetItemTabs } from "./dataset-item-tabs";

describe("getDatasetItemTabs", () => {
  it("encodes item IDs in both tab links", () => {
    const tabs = getDatasetItemTabs({
      projectId: "project",
      datasetId: "dataset",
      itemId: "layer/item:1",
    });

    expect(tabs.map((tab) => tab.href)).toEqual([
      "/project/project/datasets/dataset/items/layer%2Fitem%3A1",
      "/project/project/datasets/dataset/items/layer%2Fitem%3A1/runs",
    ]);
  });
});
