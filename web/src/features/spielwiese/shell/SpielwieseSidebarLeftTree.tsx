import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/src/utils/tailwind";
import type {
  SpielwieseSidebarSection,
  SpielwieseSidebarTreeItem,
} from "../types/shell";

function DocumentGlyph({ item }: { item: SpielwieseSidebarTreeItem }) {
  if (item.emoji) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex size-5 shrink-0 items-center justify-center text-sm"
      >
        {item.emoji}
      </span>
    );
  }

  if (item.icon) {
    const Icon = item.icon;
    return <Icon className="size-4 shrink-0" />;
  }

  return (
    <span
      aria-hidden="true"
      className="text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center"
    >
      <FileText className="size-4" />
    </span>
  );
}

function TreeLeaf({ item }: { item: SpielwieseSidebarTreeItem }) {
  return (
    <a
      aria-current={item.isActive ? "page" : undefined}
      className={cn(
        "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        item.isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      href={item.href}
    >
      <DocumentGlyph item={item} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count ? (
        <span className="text-muted-foreground shrink-0 text-sm">
          {item.count}
        </span>
      ) : null}
    </a>
  );
}

function TreeBranch({ item }: { item: SpielwieseSidebarTreeItem }) {
  const isOpen = item.defaultOpen || item.isActive;

  return (
    <details
      className="group/branch flex flex-col gap-1 [&_summary::-webkit-details-marker]:hidden"
      open={isOpen}
    >
      <summary
        className={cn(
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex list-none items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          item.isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        <DocumentGlyph item={item} />
        <ChevronRight className="text-muted-foreground size-4 shrink-0 group-open/branch:hidden" />
        <ChevronDown className="text-muted-foreground hidden size-4 shrink-0 group-open/branch:block" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.count ? (
          <span className="text-muted-foreground shrink-0 text-sm">
            {item.count}
          </span>
        ) : null}
      </summary>

      <div className="ml-7 flex flex-col gap-1">
        {item.children?.map((child) => {
          if (child.children?.length) {
            return <TreeBranch item={child} key={child.id} />;
          }

          return <TreeLeaf item={child} key={child.id} />;
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
  const ActionIcon = section.actionIcon;
  let content: ReactNode = null;

  if (section.items.length) {
    content = (
      <div className="relative flex flex-col gap-1">
        {section.items.map((item) => {
          if (item.children?.length) {
            return <TreeBranch item={item} key={item.id} />;
          }

          return <TreeLeaf item={item} key={item.id} />;
        })}
      </div>
    );
  } else if (section.emptyState) {
    content = (
      <div className="text-muted-foreground px-2 py-2 text-sm">
        {section.emptyState}
      </div>
    );
  }

  return (
    <details
      className="group/section flex flex-col gap-1 [&_summary::-webkit-details-marker]:hidden"
      open={section.defaultOpen}
    >
      <summary className="hover:bg-sidebar-accent flex list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors">
        <span className="min-w-0 flex-1 truncate">{section.label}</span>
        {ActionIcon ? (
          <span className="text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center">
            <ActionIcon className="size-4" />
          </span>
        ) : null}
        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
      </summary>
      {content}
    </details>
  );
}

export function SidebarSectionList({
  sections,
}: {
  sections: SpielwieseSidebarSection[];
}) {
  return (
    <>
      {sections.map((section) => (
        <SidebarSectionBlock key={section.id} section={section} />
      ))}
    </>
  );
}
