import type { ScoreConfigDomain } from "@langfuse/shared";
import type {
  AnnotationScore,
  AnnotationScoreFormData,
} from "@/src/features/scores/types";

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
