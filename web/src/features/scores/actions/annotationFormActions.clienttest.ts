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

it("sends a flushed comment after the score's in-flight value save", async () => {
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
  const target = {
    key: "trace",
    initialFormData: [],
    scoreMetadata: { projectId: "project" },
    scoreTarget: { type: "trace", traceId: "trace-1" },
    analyticsData: { type: "trace", source: "AnnotationQueue", isV4: true },
    configControl: { configs: [{ id: "quality", minValue: 1, maxValue: 5 }] },
  } as unknown as PreparedAnnotationTarget;
  let settleValueSave!: () => void;
  const valueSave = new Promise<void>((resolve) => {
    settleValueSave = resolve;
  });
  const updates: { value?: number | null; comment?: string | null }[] = [];
  const actions = createAnnotationFormActions({
    form: {
      getValues: () => scoreData,
      setValue: (name: string, value: unknown) => {
        const property = name.split(".")[2]!;
        scoreData[0] = { ...scoreData[0]!, [property]: value };
      },
      clearErrors: () => undefined,
      getFieldState: () => ({}),
    } as unknown as UseFormReturn<AnnotateFormSchemaType>,
    replaceField: (_index, next) => {
      scoreData[0] = { ...next, id: next.id ?? null };
    },
    insertField: () => undefined,
    initialTargets: [target],
    capture: (() => undefined) as never,
    createScore: async () => undefined,
    updateScore: (data) => {
      updates.push(data);
      return updates.length === 1 ? valueSave : Promise.resolve();
    },
    deleteScore: async () => undefined,
  });
  const key = annotationFieldKey(field);

  // Mark Completed blurs the edited value, then flushes the comment draft.
  actions.setCommentDraft(key, "cites the wrong source");
  actions.saveNumeric(key, target, {
    value: "4",
    valueAsNumber: 4,
    validity: { badInput: false },
  } as HTMLInputElement);
  actions.flushPendingComments();

  expect(updates).toEqual([
    expect.objectContaining({ value: 4, comment: null }),
  ]);
  settleValueSave();
  await vi.waitFor(() =>
    expect(updates).toEqual([
      expect.objectContaining({ value: 4, comment: null }),
      expect.objectContaining({ value: 4, comment: "cites the wrong source" }),
    ]),
  );
});
