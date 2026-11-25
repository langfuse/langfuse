import {
  GripVerticalIcon,
  MoreVerticalIcon,
  type IconComponent,
} from "@langfuse/icons";
import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { cn } from "@/src/utils/tailwind";

export type DataCardActions = {
  inline?: boolean;
  draggable?: boolean;
  buttons?: {
    id: string;
    label: string;
    icon: IconComponent;
    onClick: () => void;
    disabled?: boolean;
  }[];
  menu?: DropdownMenuItemDefinition[];
};

export function DataCardActionBar({
  actions,
  inline = actions.inline,
}: {
  actions: DataCardActions;
  inline?: boolean;
}) {
  const buttonClassName = cn(
    "hover:text-foreground disabled:opacity-50",
    inline &&
      "hover:bg-accent focus-visible:ring-ring flex size-7 cursor-pointer items-center justify-center rounded focus-visible:ring-2 pointer-coarse:size-9",
  );
  return (
    <div
      className={
        inline
          ? "ph-no-capture text-muted-foreground flex shrink-0 items-center gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100 [@media(hover:none)]:opacity-100"
          : "bg-card text-muted-foreground absolute top-2 right-2 z-1 flex items-center gap-2 rounded-md border px-2 py-1 opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100 has-aria-expanded:opacity-100"
      }
    >
      {actions.draggable && (
        <GripVerticalIcon
          size="base"
          __rawClassName="drag-handle hidden cursor-grab active:cursor-grabbing lg:block"
        />
      )}
      {actions.buttons?.map(({ id, label, icon: Icon, onClick, disabled }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          title={label}
          onClick={onClick}
          disabled={disabled}
          className={buttonClassName}
        >
          <Icon size="base" />
        </button>
      ))}
      {actions.menu && actions.menu.length > 0 && (
        <DropdownMenu
          noCapture={inline}
          placement="bottom-end"
          items={actions.menu}
        >
          {({ getTriggerProps }) => (
            <button
              type="button"
              aria-label="Widget actions"
              className={buttonClassName}
              {...getTriggerProps()}
            >
              <MoreVerticalIcon size="base" />
            </button>
          )}
        </DropdownMenu>
      )}
    </div>
  );
}
