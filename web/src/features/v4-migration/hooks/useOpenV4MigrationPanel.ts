import {
  useV4MigrationPanel,
  type V4MigrationPanelOpenSource,
  type V4MigrationTargetProject,
} from "@/src/features/v4-migration/V4MigrationPanelProvider";

export function useOpenV4MigrationPanel() {
  const { openForProject } = useV4MigrationPanel();

  return (
    project: V4MigrationTargetProject,
    source: V4MigrationPanelOpenSource,
  ) => {
    openForProject(project, source);
  };
}
