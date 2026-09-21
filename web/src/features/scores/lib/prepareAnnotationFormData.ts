import type { ScoreConfigDomain } from "@langfuse/shared";
import type {
  AnnotationScore,
  AnnotationScoreFormData,
  PreparedAnnotationTarget,
} from "@/src/features/scores/types";
import { preferredAnnotationTargets } from "@/src/features/scores/lib/annotationConfigSelection";

export function prepareCombinedAnnotationTargets(
  targets: PreparedAnnotationTarget[],
): PreparedAnnotationTarget[] {
  const ordered = preferredAnnotationTargets(targets);
  const savedConfigIds = new Set(
    ordered.flatMap((target) =>
      target.initialFormData
        .filter((field) => field.id)
        .map((field) => field.configId),
    ),
  );
  const emptyFields = new Map<string, AnnotationScoreFormData>();
  for (const target of ordered) {
    for (const field of target.initialFormData) {
      if (!field.id && !savedConfigIds.has(field.configId))
        emptyFields.set(field.configId, field);
    }
  }
  return ordered.map((target) => {
    const fields = target.initialFormData.filter((field) => field.id);
    for (const [configId, field] of emptyFields) {
      if (
        !target.configControl.configs.some((config) => config.id === configId)
      )
        continue;
      fields.push(field);
      emptyFields.delete(configId);
    }
    return { ...target, initialFormData: fields };
  });
}

export function prepareAnnotationFormData(
  scores: AnnotationScore[],
  configs: ScoreConfigDomain[],
  selectedConfigIds: string[],
): AnnotationScoreFormData[] {
  const fields = scores.map(
    ({
      id,
      configId,
      name,
      dataType,
      value,
      stringValue,
      comment,
      timestamp,
    }) => ({
      id,
      configId,
      name,
      dataType,
      value,
      stringValue,
      comment,
      timestamp,
    }),
  );
  const scoredConfigs = new Set(fields.map((field) => field.configId));
  for (const configId of selectedConfigIds) {
    if (scoredConfigs.has(configId)) continue;
    const config = configs.find((candidate) => candidate.id === configId);
    if (!config) continue;
    fields.push({
      id: null,
      configId,
      name: config.name,
      dataType: config.dataType,
      value: null,
      stringValue: null,
      comment: null,
      timestamp: null,
    });
  }
  return fields.sort((left, right) => left.name.localeCompare(right.name));
}
