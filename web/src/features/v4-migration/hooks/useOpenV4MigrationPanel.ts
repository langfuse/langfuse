import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import {
  useV4MigrationPanel,
  type V4MigrationTargetProject,
} from "@/src/features/v4-migration/V4MigrationPanelProvider";

export function useOpenV4MigrationPanel() {
  const { openForProject } = useV4MigrationPanel();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();

  return (project: V4MigrationTargetProject) => {
    setAiAgentOpen(false);
    setSupportDrawerOpen(false);
    openForProject(project);
  };
}
