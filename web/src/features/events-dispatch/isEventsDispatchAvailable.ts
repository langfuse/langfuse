type EventsDispatchProject = { id: string; topicsEnabled?: boolean };

/**
 * Project allowlist AND (internal view OR the caller's feature preview).
 * Each caller resolves both booleans, so each feature checks its own flag.
 */
export function isEventsDispatchAvailable(
  project: EventsDispatchProject | null | undefined,
  {
    internalViewEnabled,
    previewEnabled,
  }: { internalViewEnabled: boolean; previewEnabled: boolean },
): project is EventsDispatchProject {
  return (
    !!project &&
    project.topicsEnabled === true &&
    (internalViewEnabled || previewEnabled)
  );
}
