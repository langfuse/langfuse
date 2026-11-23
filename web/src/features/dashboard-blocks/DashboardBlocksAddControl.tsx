import { BarChart3, FileText, Plus, Library } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";

export function DashboardBlocksAddControl({
  capabilities,
  capabilitiesPending,
  onCreate,
  onExistingWidget,
}: {
  capabilities: { multiQuery: boolean; markdown: boolean };
  capabilitiesPending: boolean;
  onCreate: (kind: "multiQuery" | "markdown") => void;
  onExistingWidget: () => void;
}) {
  if (capabilitiesPending)
    return <Button text="Add widget" icon={Plus} loading disabled />;
  if (!capabilities.multiQuery && !capabilities.markdown)
    return <Button text="Add widget" icon={Plus} onClick={onExistingWidget} />;
  const items: DropdownMenuItemDefinition[] = [];
  if (capabilities.multiQuery)
    items.push({
      id: "multi-query",
      type: "item",
      title: "New multi-query chart",
      description: "Compare independently filtered queries",
      icon: BarChart3,
      onClick: () => onCreate("multiQuery"),
    });
  if (capabilities.markdown)
    items.push({
      id: "markdown",
      type: "item",
      title: "Markdown",
      description: "Add headings, notes, and links",
      icon: FileText,
      onClick: () => onCreate("markdown"),
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
        <Button {...getTriggerProps()} text="Add widget" icon={Plus} />
      )}
    </DropdownMenu>
  );
}
