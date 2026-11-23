import { BarChart3, FileText, Plus, Library } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { useDashboardBlocks } from "./dashboard-block-context";

export function DashboardBlocksAddMenu({
  onExistingWidget,
}: {
  onExistingWidget: () => void;
}) {
  const { capabilities, capabilitiesPending, canEdit, openEditor } =
    useDashboardBlocks();
  if (capabilitiesPending)
    return <Button text="Add widget" icon={Plus} loading disabled />;
  if (!canEdit || (!capabilities.multiQuery && !capabilities.markdown))
    return <Button text="Add widget" icon={Plus} onClick={onExistingWidget} />;
  const items: DropdownMenuItemDefinition[] = [];
  if (capabilities.multiQuery)
    items.push({
      id: "multi-query",
      type: "item",
      title: "New multi-query chart",
      description: "Compare independently filtered queries",
      icon: BarChart3,
      onClick: () => openEditor({ kind: "multiQuery" }),
    });
  if (capabilities.markdown)
    items.push({
      id: "markdown",
      type: "item",
      title: "Markdown",
      description: "Add headings, notes, and links",
      icon: FileText,
      onClick: () => openEditor({ kind: "markdown" }),
    });
  items.push({
    id: "existing",
    type: "item",
    title: "Existing widgets and home cards",
    icon: Library,
    onClick: onExistingWidget,
  });
  return (
    <DropdownMenu items={items} ariaLabel="Add widget" width="wide">
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps()}
          type="button"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <Plus size="base" color="inherit" />
          Add widget
        </button>
      )}
    </DropdownMenu>
  );
}
