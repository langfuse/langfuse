import { resolveSourceDatasetId } from "./resolveSourceDatasetId";

const withDataset = {
  experimentId: "exp-ds",
  datasetId: "dataset-1",
};
const localOnly = {
  experimentId: "exp-local",
  datasetId: null,
};
const otherDataset = {
  experimentId: "exp-other",
  datasetId: "dataset-2",
};

describe("resolveSourceDatasetId", () => {
  it("uses the baseline's Langfuse dataset", () => {
    expect(
      resolveSourceDatasetId(
        [withDataset, otherDataset],
        withDataset.experimentId,
      ),
    ).toBe("dataset-1");
  });

  it("does not link when the baseline is local data", () => {
    expect(
      resolveSourceDatasetId([localOnly, withDataset], localOnly.experimentId),
    ).toBeNull();
  });

  it("does not link when the baseline is missing from the selection", () => {
    expect(resolveSourceDatasetId([withDataset], "exp-missing")).toBeNull();
  });

  it("uses the single shared dataset when there is no baseline", () => {
    expect(
      resolveSourceDatasetId([
        withDataset,
        { experimentId: "exp-ds-2", datasetId: "dataset-1" },
      ]),
    ).toBe("dataset-1");
  });

  it("does not pick a destination when selected runs reference different datasets", () => {
    expect(resolveSourceDatasetId([withDataset, otherDataset])).toBeNull();
  });

  it("does not link when no selected run references a dataset", () => {
    expect(resolveSourceDatasetId([localOnly])).toBeNull();
  });
});
