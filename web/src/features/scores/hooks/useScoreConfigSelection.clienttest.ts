import { describe, expect, it, vi } from "vitest";
import { type ScoreConfigDomain } from "@langfuse/shared";
import { getScoreConfigSelection } from "../lib/annotationConfigSelection";
import { prepareCombinedAnnotationTargets } from "../lib/prepareAnnotationFormData";
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

it("lists each config once, defaults additions to observation, and preserves saved scores when deselecting", () => {
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
  const insert = vi.fn();
  const selection = getScoreConfigSelection({
    targets: [trace, observation],
    controlledFields: [],
    insert,
    remove,
  });
  expect(selection.selectionOptions).toHaveLength(1);
  selection.handleSelectionChange([config.id]);
  expect(insert).toHaveBeenCalledExactlyOnceWith(
    0,
    expect.objectContaining({
      configId: config.id,
      targetKey: observation.key,
    }),
  );
  observation.configControl.setSelectedConfigIds = vi.fn();
  trace.configControl.setSelectedConfigIds = vi.fn();
  getScoreConfigSelection({
    targets: [trace, observation],
    controlledFields: [saved, empty],
    insert: vi.fn(),
    remove,
  }).handleSelectionChange([]);
  expect(remove).toHaveBeenCalledExactlyOnceWith([1]);
  expect(observation.configControl.setSelectedConfigIds).not.toHaveBeenCalled();
  expect(
    trace.configControl.setSelectedConfigIds,
  ).toHaveBeenCalledExactlyOnceWith([]);

  observation.initialFormData = [{ ...saved, id: null }];
  trace.initialFormData = [{ ...empty }];
  const prepared = prepareCombinedAnnotationTargets([trace, observation]);
  expect(prepared[0]!.initialFormData).toHaveLength(1);
  expect(prepared[1]!.initialFormData).toHaveLength(0);
  observation.configControl.setSelectedConfigIds = vi.fn();
  trace.configControl.setSelectedConfigIds = vi.fn();
  getScoreConfigSelection({
    targets: [trace, observation],
    controlledFields: [{ ...saved, id: null }],
    insert: vi.fn(),
    remove: vi.fn(),
  }).handleSelectionChange([]);
  expect(
    observation.configControl.setSelectedConfigIds,
  ).toHaveBeenCalledExactlyOnceWith([]);
  expect(
    trace.configControl.setSelectedConfigIds,
  ).toHaveBeenCalledExactlyOnceWith([]);

  observation.initialFormData = [{ ...saved, value: 0 }];
  trace.initialFormData = [{ ...empty, id: "trace-score", value: 1 }];
  const existing = prepareCombinedAnnotationTargets([trace, observation]);
  expect(existing.flatMap((target) => target.initialFormData)).toEqual([
    expect.objectContaining({ id: "saved-score", value: 0 }),
    expect.objectContaining({ id: "trace-score", value: 1 }),
  ]);
});
