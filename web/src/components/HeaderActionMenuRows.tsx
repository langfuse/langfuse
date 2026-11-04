import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";

type MenuItem = Extract<DropdownMenuItemDefinition, { type: "item" }>;

const isMenuItem = (item: DropdownMenuItemDefinition): item is MenuItem =>
  item.type === "item";

/** Renders the clickable items of a dropdown definition as menu rows. */
export function HeaderActionMenuRows({
  items,
}: {
  items: DropdownMenuItemDefinition[];
}) {
  return (
    <>
      {items.filter(isMenuItem).map((item) => {
        const Icon = item.icon;
        return (
          <HeaderActionMenuRow
            key={item.id}
            label={item.title}
            icon={
              Icon && (
                <Icon
                  size="base"
                  color={item.variant !== "destructive" ? "default" : "inherit"}
                />
              )
            }
            badge={item.badge}
            variant={item.variant}
            disabled={item.disabled !== undefined}
            disabledReason={item.disabled?.reason}
            onClick={item.onClick}
          />
        );
      })}
    </>
  );
}
