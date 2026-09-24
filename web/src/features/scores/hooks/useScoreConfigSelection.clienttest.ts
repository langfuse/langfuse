import { describe, expect, it, vi } from "vitest";
import { type ScoreConfigDomain } from "@langfuse/shared";
import {
  annotationFieldKey,
  getScoreConfigSelection,
} from "../lib/annotationConfigSelection";
import type { PreparedAnnotationTarget } from "../types";

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

function makeTarget(key: string): PreparedAnnotationTarget {
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
      configs: [config],
      allowManualSelection: true,
      selectedConfigIds: [config.id],
      setSelectedConfigIds: vi.fn(),
    },
  };
}

const empty = {
  targetKey: "observation",
  configId: config.id,
  name: config.name,
  dataType: config.dataType,
  id: null,
};

describe("score field selection", () => {
  it("lists each config once, defaults additions to observation, and prevents duplicate or archived additions", () => {
    const observation = makeTarget("observation");
    const trace = makeTarget("trace");
    const insert = vi.fn();
    const selection = getScoreConfigSelection({
      targets: [trace, observation],
      controlledFields: [],
      insert,
      remove: vi.fn(),
    });
    expect(selection.selectionOptions).toHaveLength(1);
    selection.addScore(config.id);
    expect(insert).toHaveBeenCalledExactlyOnceWith(
      0,
      expect.objectContaining({
        configId: config.id,
        targetKey: observation.key,
      }),
    );
    insert.mockClear();
    getScoreConfigSelection({
      targets: [trace, observation],
      controlledFields: [empty],
      insert,
      remove: vi.fn(),
    }).addScore(config.id);
    observation.configControl.configs = [{ ...config, isArchived: true }];
    getScoreConfigSelection({
      targets: [observation],
      controlledFields: [],
      insert,
      remove: vi.fn(),
    }).addScore(config.id);
    expect(insert).not.toHaveBeenCalled();
  });

  it("removes only an empty row and clears remembered preferences without hiding another target's score", () => {
    const observation = makeTarget("observation");
    const trace = makeTarget("trace");
    const remove = vi.fn();
    const saved = { ...empty, targetKey: "trace", id: "saved-score", value: 0 };
    const selection = getScoreConfigSelection({
      targets: [trace, observation],
      controlledFields: [empty, saved],
      insert: vi.fn(),
      remove,
    });
    selection.removeEmptyField(annotationFieldKey(saved));
    expect(remove).not.toHaveBeenCalled();
    selection.removeEmptyField(annotationFieldKey(empty));
    expect(remove).toHaveBeenCalledExactlyOnceWith(0);
    expect(
      observation.configControl.setSelectedConfigIds,
    ).toHaveBeenCalledExactlyOnceWith([]);
    expect(trace.configControl.setSelectedConfigIds).not.toHaveBeenCalled();
    remove.mockClear();
    for (const draft of [
      { ...empty, value: 0 },
      { ...empty, stringValue: "Draft" },
      { ...empty, comment: "Note" },
    ]) {
      getScoreConfigSelection({
        targets: [observation],
        controlledFields: [draft],
        insert: vi.fn(),
        remove,
      }).removeEmptyField(annotationFieldKey(draft));
    }
    observation.configControl.configs = [{ ...config, isArchived: true }];
    getScoreConfigSelection({
      targets: [observation],
      controlledFields: [empty],
      insert: vi.fn(),
      remove,
    }).removeEmptyField(annotationFieldKey(empty));
    expect(remove).not.toHaveBeenCalled();
    observation.configControl.configs = [config];
    observation.configControl.allowManualSelection = false;
    getScoreConfigSelection({
      targets: [observation],
      controlledFields: [empty],
      insert: vi.fn(),
      remove,
    }).removeEmptyField(annotationFieldKey(empty));
    expect(remove).not.toHaveBeenCalled();
    observation.configControl.allowManualSelection = true;
    vi.mocked(observation.configControl.setSelectedConfigIds).mockClear();
    getScoreConfigSelection({
      targets: [trace, observation],
      controlledFields: [empty],
      insert: vi.fn(),
      remove,
    }).removeEmptyField(annotationFieldKey(empty));
    expect(
      observation.configControl.setSelectedConfigIds,
    ).toHaveBeenCalledExactlyOnceWith([]);
    expect(
      trace.configControl.setSelectedConfigIds,
    ).toHaveBeenCalledExactlyOnceWith([]);
  });
});
