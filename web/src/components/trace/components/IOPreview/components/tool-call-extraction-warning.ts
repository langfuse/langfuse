const TOOL_EXTRACTION_LEGACY_CUTOFF_MS = Date.UTC(2025, 5, 1);

function getObservationStartTimeMs(
  observationStartTime?: Date | string | null,
): number | undefined {
  if (!observationStartTime) return undefined;

  const timestamp =
    observationStartTime instanceof Date
      ? observationStartTime.getTime()
      : Date.parse(observationStartTime);

  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function getToolNamesMissingFromToolDefinitions({
  observationStartTime,
  frontendToolDefinitionNames,
  toolDefinitionNames,
}: {
  observationStartTime?: Date | string | null;
  frontendToolDefinitionNames: string[];
  toolDefinitionNames?: string[];
}): string[] {
  const observationStartTimeMs =
    getObservationStartTimeMs(observationStartTime);

  if (
    observationStartTimeMs === undefined ||
    observationStartTimeMs >= TOOL_EXTRACTION_LEGACY_CUTOFF_MS ||
    frontendToolDefinitionNames.length === 0 ||
    !Array.isArray(toolDefinitionNames)
  ) {
    return [];
  }

  const toolDefinitionNameSet = new Set(toolDefinitionNames);

  return Array.from(new Set(frontendToolDefinitionNames)).filter(
    (toolName) => !toolDefinitionNameSet.has(toolName),
  );
}
