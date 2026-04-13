import { ChevronRight, FileText, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { sidebarMenuButtonVariants } from "../ui/sidebar";
import type {
  SpielwieseSidebarSection,
  SpielwieseSidebarTreeItem,
} from "../types/shell";
import { SpielwieseSidebarShortcut } from "./SpielwieseSidebarShortcut";

function SidebarFileLeafContent({ item }: { item: SpielwieseSidebarTreeItem }) {
  const Icon = item.icon ?? FileText;

  return (
    <>
      <Icon className="size-3.5 shrink-0" data-sidebar-icon />
      <span data-sidebar-label>{item.label}</span>
      {item.shortcut ? (
        <SpielwieseSidebarShortcut label={item.shortcut} />
      ) : null}
      {item.isActive ? (
        <span data-sidebar-action>
          <MoreHorizontal className="size-3.5" />
        </span>
      ) : null}
    </>
  );
}

function SidebarFileLeaf({ item }: { item: SpielwieseSidebarTreeItem }) {
  const className = cn(
    sidebarMenuButtonVariants({ active: item.isActive, tone: "primary" }),
    "group/sidebar-item",
    item.isDummy ? "cursor-default" : undefined,
  );

  if (item.isDummy) {
    return (
      <button
        aria-disabled="true"
        className={className}
        data-sidebar-dummy
        type="button"
      >
        <SidebarFileLeafContent item={item} />
      </button>
    );
  }

  return (
    <a
      aria-current={item.isActive ? "page" : undefined}
      className={className}
      href={item.href}
    >
      <SidebarFileLeafContent item={item} />
    </a>
  );
}

function SidebarFileBranch({ item }: { item: SpielwieseSidebarTreeItem }) {
  const isOpen = item.defaultOpen;

  return (
    <details
      className="group/branch flex flex-col gap-0.5 [&_summary::-webkit-details-marker]:hidden"
      open={isOpen}
    >
      <summary
        className={cn(
          sidebarMenuButtonVariants({ active: item.isActive, tone: "primary" }),
          "group/sidebar-item list-none text-black/[0.55] hover:text-black/[0.55]",
        )}
      >
        <ChevronRight
          className="size-3.5 shrink-0 transition-transform group-open/branch:rotate-90"
          data-sidebar-icon
        />
        <span data-sidebar-label>{item.label}</span>
        {item.shortcut ? (
          <SpielwieseSidebarShortcut label={item.shortcut} />
        ) : null}
      </summary>

      <div className="ml-4 flex flex-col gap-0.5 border-l border-black/[0.05] pl-2">
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
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 px-2">
        <div className="text-[0.6875rem] font-semibold tracking-[0.08em] text-black/[0.4] uppercase">
          {section.label}
        </div>
        <button
          aria-label={`Add to ${section.label}`}
          className="inline-flex size-5 items-center justify-center rounded-[7px] text-black/[0.46] transition-colors hover:bg-black/[0.045] hover:text-[#242529]"
          type="button"
        >
          <Plus className="size-3.5 shrink-0" data-sidebar-icon />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {section.items.map((item) =>
          item.children?.length ? (
            <SidebarFileBranch item={item} key={item.id} />
          ) : (
            <SidebarFileLeaf item={item} key={item.id} />
          ),
        )}
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
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <SidebarSectionBlock key={section.id} section={section} />
      ))}
    </div>
  );
}
