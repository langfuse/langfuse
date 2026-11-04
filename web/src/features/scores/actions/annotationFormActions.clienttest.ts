// @vitest-environment node

import type { UseFormReturn } from "react-hook-form";
import { createAnnotationFormActions } from "@/src/features/scores/actions/annotationFormActions";
import { annotationFieldKey } from "@/src/features/scores/lib/annotationConfigSelection";
import { flushPendingAnnotationComments } from "@/src/features/scores/state/pendingAnnotationComments";
import type {
  AnnotateFormSchemaType,
  AnnotationScoreFormData,
  PreparedAnnotationTarget,
} from "@/src/features/scores/types";

describe("pending score comment drafts", () => {
  it("persists a trimmed comment draft when annotation comments are flushed", () => {
    const field: AnnotationScoreFormData = {
      targetKey: "trace",
      id: "score-1",
      configId: "quality",
      name: "Quality",
      dataType: "NUMERIC",
      value: 1,
      stringValue: null,
      comment: null,
    };
    const scoreData = [field];
    const updates: { id?: string; comment?: string | null }[] = [];
    const form = {
      getValues: (name: string) =>
        name === "scoreData" ? scoreData : { scoreData },
      getFieldState: () => ({ invalid: false }),
      clearErrors: () => undefined,
      setError: () => undefined,
      setValue: () => undefined,
    } as unknown as UseFormReturn<AnnotateFormSchemaType>;
    const target = {
      key: "trace",
      label: "Trace",
      initialFormData: [field],
      scoreMetadata: { projectId: "project", queueId: "queue" },
      scoreTarget: { type: "trace", traceId: "trace-1" },
      analyticsData: {
        type: "trace",
        source: "AnnotationQueue",
        isV4: true,
      },
      configControl: {
        configs: [],
        allowManualSelection: false,
        selectedConfigIds: [],
        setSelectedConfigIds: () => undefined,
      },
    } as PreparedAnnotationTarget;
    const actions = createAnnotationFormActions({
      form,
      replaceField: (index, next) => {
        scoreData[index] = { ...next, id: next.id ?? null };
      },
      insertField: () => undefined,
      initialTargets: [target],
      capture: (() => undefined) as never,
      createScore: async () => undefined,
      updateScore: async (data) => {
        updates.push(data);
      },
      deleteScore: async () => undefined,
    });

    actions.open();
    actions.setCommentDraft(annotationFieldKey(field), "  corrected answer  ");
    flushPendingAnnotationComments();

    expect(updates).toEqual([
      expect.objectContaining({
        id: "score-1",
        comment: "corrected answer",
      }),
    ]);

    flushPendingAnnotationComments();
    expect(updates).toHaveLength(1);
    actions.close();
  });
});
