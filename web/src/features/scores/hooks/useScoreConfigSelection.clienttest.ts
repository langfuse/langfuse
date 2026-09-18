import { describe, expect, it, vi } from "vitest";
import { type ScoreConfigDomain } from "@langfuse/shared";
import {
  annotationFieldKey,
  getScoreConfigSelection,
} from "../lib/annotationConfigSelection";
import type { PreparedAnnotationTarget } from "../types";

const { setEmptySelectedConfigIds } = vi.hoisted(() => ({
  setEmptySelectedConfigIds: vi.fn(),
}));

describe("score field selection", () => {
  it("clears all empty fields while retaining saved and archived fields", () => {
    const ids = ["empty-a", "saved", "empty-b", "archived"];
    const configs = ids.map((id) => ({
      id,
      name: id,
      projectId: "project",
      createdAt: new Date(),
      updatedAt: new Date(),
      dataType: "NUMERIC" as const,
      isArchived: id === "archived",
    })) satisfies ScoreConfigDomain[];
    const remove = vi.fn();
    const selection = getScoreConfigSelection({
      targets: [
        makeTarget("observation", configs, ["empty-a", "empty-b", "archived"]),
      ],
      controlledFields: ids.map((id) => ({
        targetKey: "observation",
        configId: id,
        name: id,
        dataType: "NUMERIC",
        id: id === "saved" ? "score" : null,
      })),
      insert: vi.fn(),
      remove,
    });

    selection.handleSelectionChange([]);

    expect(remove).toHaveBeenCalledExactlyOnceWith([0, 2]);
    expect(setEmptySelectedConfigIds).toHaveBeenCalledExactlyOnceWith([
      "archived",
    ]);
  });
});

function makeTarget(
  key: string,
  configs: ScoreConfigDomain[],
  selectedConfigIds: string[],
): PreparedAnnotationTarget {
  return {
    key,
    label: key,
    scoreTarget: {
      type: "trace",
      traceId: "trace",
      observationId: key === "observation" ? "observation" : undefined,
    },
    scoreMetadata: { projectId: "project" },
    analyticsData: { type: "trace", source: "TraceDetail", isV4: true },
    initialFormData: [],
    configControl: {
      configs,
      allowManualSelection: true,
      selectedConfigIds,
      setSelectedConfigIds: setEmptySelectedConfigIds,
    },
  };
}

it("keeps remembered saved fields and deselects only the matching target", () => {
  const config = {
    id: "quality",
    name: "Quality",
    projectId: "project",
    dataType: "BOOLEAN",
    categories: [
      { label: "False", value: 0 },
      { label: "True", value: 1 },
    ],
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies ScoreConfigDomain;
  const observation = makeTarget("observation", [config], [config.id]);
  const trace = makeTarget("trace", [config], [config.id]);
  observation.configControl.setSelectedConfigIds = vi.fn();
  trace.configControl.setSelectedConfigIds = vi.fn();
  const saved = {
    targetKey: observation.key,
    configId: config.id,
    name: config.name,
    dataType: config.dataType,
    id: "saved-score",
  };
  const empty = { ...saved, targetKey: trace.key, id: null };
  const remove = vi.fn();
  getScoreConfigSelection({
    targets: [observation, trace],
    controlledFields: [saved, empty],
    insert: vi.fn(),
    remove,
  }).handleSelectionChange([annotationFieldKey(saved)]);
  expect(remove).toHaveBeenCalledExactlyOnceWith([1]);
  expect(observation.configControl.setSelectedConfigIds).not.toHaveBeenCalled();
  expect(
    trace.configControl.setSelectedConfigIds,
  ).toHaveBeenCalledExactlyOnceWith([]);
});
