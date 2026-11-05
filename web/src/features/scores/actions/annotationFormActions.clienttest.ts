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

it("sends a flushed comment after the score's in-flight value save, never with an older value", async () => {
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
  const inFlight: (() => void)[] = [];
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
      return new Promise<void>((resolve) => inFlight.push(resolve));
    },
    deleteScore: async () => undefined,
  });
  const key = annotationFieldKey(field);
  const saveValue = (value: number) =>
    actions.saveNumeric(key, target, {
      value: String(value),
      valueAsNumber: value,
      validity: { badInput: false },
    } as HTMLInputElement);
  const settleWrites = async () => {
    while (inFlight.length > 0) {
      inFlight.splice(0).forEach((settle) => settle());
      await new Promise((resolve) => setTimeout(resolve));
    }
  };

  // Mark Completed blurs the edited value, then flushes the comment draft.
  actions.setCommentDraft(key, "cites the wrong source");
  saveValue(4);
  actions.flushPendingComments();

  expect(updates).toEqual([
    expect.objectContaining({ value: 4, comment: null }),
  ]);
  await settleWrites();
  expect(updates).toEqual([
    expect.objectContaining({ value: 4, comment: null }),
    expect.objectContaining({ value: 4, comment: "cites the wrong source" }),
  ]);

  // A value edit made while a comment waits already carries that comment.
  saveValue(3);
  actions.saveComment(key, target, "cites a retracted source");
  saveValue(2);
  await settleWrites();
  expect(updates.slice(2)).toEqual([
    expect.objectContaining({ value: 3, comment: "cites the wrong source" }),
    expect.objectContaining({ value: 2, comment: "cites a retracted source" }),
  ]);
});

it("does not send a value edited while a comment waits until earlier saves finish", async () => {
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
  let releaseFirst: () => void = () => undefined;
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirst = resolve;
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
      return updates.length === 1 ? firstWrite : Promise.resolve();
    },
    deleteScore: async () => undefined,
  });
  const key = annotationFieldKey(field);
  const saveValue = (value: number) =>
    actions.saveNumeric(key, target, {
      value: String(value),
      valueAsNumber: value,
      validity: { badInput: false },
    } as HTMLInputElement);

  saveValue(4);
  actions.saveComment(key, target, "kept");
  saveValue(2);

  // The edited value stays queued. Sending it now would let the older save
  // land last, and a comment captured at schedule time would restore value 4.
  expect(updates).toEqual([
    expect.objectContaining({ value: 4, comment: null }),
  ]);

  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve));

  expect(updates.at(-1)).toEqual(
    expect.objectContaining({ value: 2, comment: "kept" }),
  );
  expect(updates).not.toContainEqual(
    expect.objectContaining({ value: 4, comment: "kept" }),
  );
});
