import { useInAppAiAgent } from "@/src/ai/assistant";
import { useSupportDrawer } from "@/src/app/support";
import {
  useV4MigrationPanel,
  type V4MigrationPanelOpenSource,
  type V4MigrationTargetProject,
} from "@/src/migrations/v4/upgrade-experience/V4MigrationPanelProvider";

export function useOpenV4MigrationPanel() {
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();

  return (
    project: V4MigrationTargetProject,
    source: V4MigrationPanelOpenSource,
  ) => {
    setAiAgentOpen(false);
    setSupportDrawerOpen(false);
    openForProject(project, source);
  };
}
