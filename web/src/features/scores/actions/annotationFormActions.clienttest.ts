// @vitest-environment node

import type { UseFormReturn } from "react-hook-form";
import { TRPCClientError } from "@trpc/client";
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

  // A value edit made while the comment waits is sent immediately. The
  // deferred comment is sent after the earlier save, with that newer value.
  saveValue(3);
  actions.saveComment(key, target, "cites a retracted source");
  saveValue(2);
  await settleWrites();
  expect(updates.slice(2)).toEqual([
    expect.objectContaining({ value: 3, comment: "cites the wrong source" }),
    expect.objectContaining({ value: 2, comment: "cites a retracted source" }),
    expect.objectContaining({ value: 2, comment: "cites a retracted source" }),
  ]);
});

it("leaves the item open when a flushed comment save fails and keeps the draft", async () => {
  const draft = "  Latency < 2s but output > 500 tokens  ";
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
  const pending: {
    comment: string | null;
    resolve: () => void;
    reject: (error: unknown) => void;
  }[] = [];
  const actions = createAnnotationFormActions({
    form: {
      getValues: () => scoreData,
      setError: () => undefined,
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
        analyticsData: { type: "trace", source: "AnnotationQueue", isV4: true },
      } as unknown as PreparedAnnotationTarget,
    ],
    capture: (() => undefined) as never,
    createScore: async () => undefined,
    updateScore: (data) =>
      new Promise<void>((resolve, reject) => {
        pending.push({ comment: data.comment ?? null, resolve, reject });
      }),
    deleteScore: async () => undefined,
  });
  const key = annotationFieldKey(field);
  actions.setCommentDraft(key, draft);

  let completed = false;
  const finishing = (async () => {
    const failed = await Promise.resolve(actions.flushPendingComments());
    if (!Array.isArray(failed) || failed.length === 0) completed = true;
    return failed;
  })();
  await Promise.resolve();
  pending[0]?.reject(
    TRPCClientError.from({
      error: {
        code: -32600,
        message: JSON.stringify([
          {
            path: ["comment"],
            message: "Text cannot contain HTML tags",
          },
        ]),
        data: { code: "BAD_REQUEST", httpStatus: 400 },
      },
    }),
  );
  const failed = await finishing;

  expect(completed).toBe(false);
  expect(failed).toEqual([
    {
      name: "Quality",
      message: "comment: Text cannot contain HTML tags",
    },
  ]);
  expect(scoreData[0]?.comment).toBeNull();
  expect(actions.getCommentDraft(key)).toBe(draft);

  const retry = actions.flushPendingComments();
  await Promise.resolve();
  expect(pending.map((write) => write.comment)).toEqual([
    "Latency < 2s but output > 500 tokens",
    "Latency < 2s but output > 500 tokens",
  ]);
  pending[1]?.resolve();
  await expect(retry).resolves.toEqual([]);
});

it("retries a failed value save on the next flush and stays open until it succeeds", async () => {
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
  const pending: {
    value: number | null;
    resolve: () => void;
    reject: (error: unknown) => void;
  }[] = [];
  const actions = createAnnotationFormActions({
    form: {
      getValues: () => scoreData,
      setValue: (name: string, value: unknown) => {
        const property = name.split(".")[2]!;
        scoreData[0] = { ...scoreData[0]!, [property]: value };
      },
      setError: () => undefined,
      clearErrors: () => undefined,
      getFieldState: () => ({}),
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
        analyticsData: { type: "trace", source: "AnnotationQueue", isV4: true },
        configControl: {
          configs: [{ id: "quality", minValue: 1, maxValue: 5 }],
        },
      } as unknown as PreparedAnnotationTarget,
    ],
    capture: (() => undefined) as never,
    createScore: async () => undefined,
    updateScore: (data) =>
      new Promise<void>((resolve, reject) => {
        pending.push({ value: data.value, resolve, reject });
      }),
    deleteScore: async () => undefined,
  });
  const key = annotationFieldKey(field);
  actions.saveNumeric(
    key,
    {
      key: "trace",
      initialFormData: [],
      scoreMetadata: { projectId: "project" },
      scoreTarget: { type: "trace", traceId: "trace-1" },
      analyticsData: { type: "trace", source: "AnnotationQueue", isV4: true },
      configControl: { configs: [{ id: "quality", minValue: 1, maxValue: 5 }] },
    } as unknown as PreparedAnnotationTarget,
    {
      value: "4",
      valueAsNumber: 4,
      validity: { badInput: false },
    } as HTMLInputElement,
  );

  let completed = false;
  const finishing = (async () => {
    const failed = await actions.flushPendingComments();
    if (failed.length === 0) completed = true;
    return failed;
  })();
  await Promise.resolve();
  pending[0]?.reject(new Error("database unavailable"));
  const failed = await finishing;

  expect(completed).toBe(false);
  expect(failed).toEqual([
    { name: "Quality", message: "database unavailable" },
  ]);
  expect(scoreData[0]?.value).toBe(1);

  const retry = actions.flushPendingComments();
  await Promise.resolve();
  expect(pending.map((write) => write.value)).toEqual([4, 4]);
  pending[1]?.reject(new Error("database unavailable"));
  await expect(retry).resolves.toEqual([
    { name: "Quality", message: "database unavailable" },
  ]);

  const saved = actions.flushPendingComments();
  await Promise.resolve();
  pending.at(-1)?.resolve();
  await expect(saved).resolves.toEqual([]);
});

it("sends a deferred comment with the last saved value, not an unsaved keystroke or a replacement score", async () => {
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
  const updates: {
    id?: string;
    value?: number | null;
    comment?: string | null;
  }[] = [];
  const creates: { id?: string; comment?: string | null }[] = [];
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
    createScore: async (data) => {
      creates.push(data);
    },
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

  // A value save is in flight. Typing into the input updates the form before
  // blur validation, including an out-of-range value, and must not ride along
  // on the comment.
  saveValue(4);
  scoreData[0] = { ...scoreData[0]!, value: 9 };
  actions.saveComment(key, target, "checked the source");
  scoreData[0] = { ...scoreData[0]!, value: 8 };
  await settleWrites();
  expect(updates).toEqual([
    expect.objectContaining({ id: "score-1", value: 4, comment: null }),
    expect.objectContaining({
      id: "score-1",
      value: 4,
      comment: "checked the source",
    }),
  ]);

  // Clearing the score and entering a new one drops the queued comment.
  // It belongs to the deleted score, not the replacement.
  saveValue(3);
  actions.saveComment(key, target, "discarded");
  actions.clear(key, target);
  saveValue(2);
  await settleWrites();
  expect(updates.map((update) => update.comment)).toEqual([
    null,
    "checked the source",
    "checked the source",
  ]);
  expect(creates).toEqual([
    expect.objectContaining({ value: 2, comment: null }),
  ]);
});
