import { ChevronRight, FileText, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { sidebarMenuButtonVariants } from "../ui/sidebar";
import type {
  SpielwieseSidebarSection,
  SpielwieseSidebarTreeItem,
} from "../types/shell";

function SidebarFileLeaf({ item }: { item: SpielwieseSidebarTreeItem }) {
  const Icon = item.icon ?? FileText;

  return (
    <a
      aria-current={item.isActive ? "page" : undefined}
      className={cn(sidebarMenuButtonVariants({ active: item.isActive }))}
      href={item.href}
    >
      <Icon className="size-3.5 shrink-0" data-sidebar-icon />
      <span data-sidebar-label>{item.label}</span>
      {item.isActive ? (
        <span data-sidebar-action>
          <MoreHorizontal className="size-3.5" />
        </span>
      ) : null}
    </a>
  );
}

function SidebarFileBranch({ item }: { item: SpielwieseSidebarTreeItem }) {
  const isOpen = item.defaultOpen || item.isActive;

  return (
    <details
      className="group/branch flex flex-col gap-0.5 [&_summary::-webkit-details-marker]:hidden"
      open={isOpen}
    >
      <summary
        className={cn(
          sidebarMenuButtonVariants({ active: item.isActive }),
          "list-none",
        )}
      >
        <ChevronRight
          className="size-3.5 shrink-0 transition-transform group-open/branch:rotate-90"
          data-sidebar-icon
        />
        <span data-sidebar-label>{item.label}</span>
      </summary>

      <div className="ml-4 flex flex-col gap-0.5">
        {item.children?.map((child) => {
          if (child.children?.length) {
            return <SidebarFileBranch item={child} key={child.id} />;
          }

          return <SidebarFileLeaf item={child} key={child.id} />;
        })}
      </div>
    </details>
  );
}

function SidebarSectionBlock({
  section,
}: {
  section: SpielwieseSidebarSection;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="text-muted-foreground px-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
        {section.label}
      </div>
      <div className="flex flex-col gap-1">
        {section.items.map((item) =>
          item.children?.length ? (
            <SidebarFileBranch item={item} key={item.id} />
          ) : (
            <SidebarFileLeaf item={item} key={item.id} />
          ),
        )}
        <button
          className={cn(
            sidebarMenuButtonVariants({}),
            "text-muted-foreground hover:text-sidebar-foreground",
          )}
          type="button"
        >
          <Plus className="size-3.5 shrink-0" data-sidebar-icon />
          <span data-sidebar-label>New</span>
        </button>
      </div>
    </section>
  );
}

export function SidebarSectionList({
  sections,
}: {
  sections: SpielwieseSidebarSection[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <SidebarSectionBlock key={section.id} section={section} />
      ))}
    </div>
  );
}
