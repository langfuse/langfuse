import { useDashboardBlocks } from "./dashboard-block-context";
import { DashboardBlocksAddControl } from "./DashboardBlocksAddControl";

export function DashboardBlocksAddMenu({
  onExistingWidget,
}: {
  onExistingWidget: () => void;
}) {
  const { capabilities, capabilitiesPending, canEdit, openEditor } =
    useDashboardBlocks();
  return (
    <DashboardBlocksAddControl
      capabilities={
        canEdit ? capabilities : { multiQuery: false, markdown: false }
      }
      capabilitiesPending={capabilitiesPending}
      onCreate={(kind) => openEditor({ kind })}
      onExistingWidget={onExistingWidget}
    />
  );
}
