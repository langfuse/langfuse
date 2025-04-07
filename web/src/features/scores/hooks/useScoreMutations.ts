import { api } from "@/src/utils/api";
import { type ScoreTarget } from "../types";
import { type ValidatedScoreConfig, type APIScore } from "@langfuse/shared";
import { type useFieldArray } from "react-hook-form";

const onTraceScoreSettledUpsert =
  ({
    projectId,
    traceId,
    utils,
    fields,
    update,
    isDrawerOpen,
    setShowSaving,
  }: {
    projectId: string;
    traceId: string;
    utils: ReturnType<typeof api.useUtils>;
    fields: ReturnType<typeof useFieldArray>["fields"];
    update: ReturnType<typeof useFieldArray>["update"];
    isDrawerOpen: boolean;
    setShowSaving: (showSaving: boolean) => void;
  }) =>
  async (data?: APIScore, error?: unknown) => {
    if (!data || error) return;

    const { id, value, stringValue, name, dataType, configId, comment } = data;
    const updatedScoreIndex = fields.findIndex(
      (field) => field.configId === configId,
    );

    update(updatedScoreIndex, {
      value,
      name,
      dataType,
      scoreId: id,
      stringValue: stringValue ?? undefined,
      configId: configId ?? undefined,
      comment: comment ?? undefined,
    });

    console.log("invalidating traces");

    await Promise.all([
      utils.scores.invalidate(),
      utils.traces.byIdWithObservationsAndScores.invalidate(
        { projectId, traceId },
        {
          type: "all",
          refetchType: "all",
        },
      ),
      utils.sessions.invalidate(),
    ]);

    if (!isDrawerOpen) setShowSaving(false);
  };

const onTraceScoreSettledDelete =
  ({
    utils,
    fields,
    update,
    configs,
    remove,
    isDrawerOpen,
    setShowSaving,
  }: {
    utils: ReturnType<typeof api.useUtils>;
    fields: ReturnType<typeof useFieldArray>["fields"];
    update: ReturnType<typeof useFieldArray>["update"];
    configs: ValidatedScoreConfig[];
    remove: ReturnType<typeof useFieldArray>["remove"];
    isDrawerOpen: boolean;
    setShowSaving: (showSaving: boolean) => void;
  }) =>
  async (data?: APIScore, error?: unknown) => {
    if (!data || error) return;

    const { id, name, dataType, configId } = data;
    const updatedScoreIndex = fields.findIndex((field) => field.scoreId === id);

    const config = configs.find((config) => config.id === configId);
    if (config && config.isArchived) {
      remove(updatedScoreIndex);
    } else {
      update(updatedScoreIndex, {
        name,
        dataType,
        configId: configId ?? undefined,
        value: null,
        scoreId: undefined,
        stringValue: undefined,
        comment: undefined,
      });
    }

    await Promise.all([
      utils.scores.invalidate(),
      utils.traces.invalidate(),
      utils.sessions.invalidate(),
    ]);

    if (!isDrawerOpen) setShowSaving(false);
  };

const onSessionScoreSettledUpsert =
  ({
    utils,
    fields,
    update,
    isDrawerOpen,
    setShowSaving,
  }: {
    utils: ReturnType<typeof api.useUtils>;
    fields: ReturnType<typeof useFieldArray>["fields"];
    update: ReturnType<typeof useFieldArray>["update"];
    isDrawerOpen: boolean;
    setShowSaving: (showSaving: boolean) => void;
  }) =>
  async (data?: APIScore, error?: unknown) => {
    if (!data || error) return;

    const { id, value, stringValue, name, dataType, configId, comment } = data;
    const updatedScoreIndex = fields.findIndex(
      (field) => field.configId === configId,
    );

    update(updatedScoreIndex, {
      value,
      name,
      dataType,
      scoreId: id,
      stringValue: stringValue ?? undefined,
      configId: configId ?? undefined,
      comment: comment ?? undefined,
    });

    await Promise.all([
      utils.scores.invalidate(),
      utils.sessions.byIdWithScores.invalidate(),
    ]);

    if (!isDrawerOpen) setShowSaving(false);
  };

export function useScoreMutations(
  scoreTarget: ScoreTarget,
  projectId: string,
  fields: ReturnType<typeof useFieldArray>["fields"],
  update: ReturnType<typeof useFieldArray>["update"],
  remove: ReturnType<typeof useFieldArray>["remove"],
  configs: ValidatedScoreConfig[],
  isDrawerOpen: boolean,
  setShowSaving: (showSaving: boolean) => void,
) {
  const utils = api.useUtils();

  const onSettledUpsert =
    scoreTarget.type === "trace"
      ? onTraceScoreSettledUpsert({
          projectId,
          traceId: scoreTarget.traceId,
          utils,
          fields,
          update,
          isDrawerOpen,
          setShowSaving,
        })
      : onSessionScoreSettledUpsert({
          utils,
          fields,
          update,
          isDrawerOpen,
          setShowSaving,
        });

  const onSettledDelete =
    scoreTarget.type === "trace"
      ? onTraceScoreSettledDelete({
          utils,
          fields,
          update,
          remove,
          configs,
          isDrawerOpen,
          setShowSaving,
        })
      : onTraceScoreSettledDelete({
          utils,
          fields,
          update,
          remove,
          configs,
          isDrawerOpen,
          setShowSaving,
        });

  // Create mutations with shared invalidation logic
  const createMutation = api.scores.createAnnotationScore.useMutation({
    onSettled: onSettledUpsert,
  });

  const updateMutation = api.scores.updateAnnotationScore.useMutation({
    onSettled: onSettledUpsert,
  });

  const deleteMutation = api.scores.deleteAnnotationScore.useMutation({
    onSuccess: onSettledDelete,
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
