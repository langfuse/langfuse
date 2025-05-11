import { AutomationsDrawer } from "./automationsDrawer";

export const AutomationsButton = ({ projectId }: { projectId: string }) => {
  return <AutomationsDrawer projectId={projectId} />;
};
