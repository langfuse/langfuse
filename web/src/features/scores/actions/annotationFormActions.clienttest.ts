// @vitest-environment node

import type { UseFormReturn } from "react-hook-form";
import { createAnnotationFormActions } from "@/src/features/scores/actions/annotationFormActions";
import { annotationFieldKey } from "@/src/features/scores/lib/annotationConfigSelection";
import type {
  AnnotateFormSchemaType,
  AnnotationScoreFormData,
  PreparedAnnotationTarget,
} from "@/src/features/scores/types";

it("flushes a trimmed pending comment through the score update", () => {
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
  const actions = createAnnotationFormActions({
    form: {
      getValues: () => scoreData,
    } as unknown as UseFormReturn<AnnotateFormSchemaType>,
    replaceField: (_index, next) => {
      scoreData[0] = { ...next, id: next.id ?? null };
    },
    insertField: () => undefined,
    initialTargets: [
      {
        key: "trace",
        initialFormData: [],
        scoreMetadata: { projectId: "project" },
        scoreTarget: { type: "trace", traceId: "trace-1" },
        analyticsData: {
          type: "trace",
          source: "AnnotationQueue",
          isV4: true,
        },
      } as unknown as PreparedAnnotationTarget,
    ],
    capture: (() => undefined) as never,
    createScore: async () => undefined,
    updateScore: async (data) => {
      updates.push(data);
    },
    deleteScore: async () => undefined,
  });

  actions.setCommentDraft(annotationFieldKey(field), "  corrected answer  ");
  actions.flushPendingComments();

  expect(updates).toEqual([
    expect.objectContaining({ id: "score-1", comment: "corrected answer" }),
  ]);
});
