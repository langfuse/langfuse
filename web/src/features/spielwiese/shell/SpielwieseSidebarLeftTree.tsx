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
      className="border-sidebar-border/60 bg-muted text-muted-foreground inline-flex size-5 shrink-0 items-center justify-center rounded-md border"
    >
      <FileText className="size-3.5" />
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
        <ChevronRight className="text-muted-foreground size-4 shrink-0 group-open/branch:hidden" />
        <ChevronDown className="text-muted-foreground hidden size-4 shrink-0 group-open/branch:block" />
        <DocumentGlyph item={item} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.count ? (
          <span className="text-muted-foreground shrink-0 text-sm">
            {item.count}
          </span>
        ) : null}
      </summary>

      <div className="border-sidebar-border/60 ml-4 flex flex-col gap-1 border-l pl-3">
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
  const SectionIcon = section.icon;
  const ActionIcon = section.actionIcon;
  let content: ReactNode = null;

  if (section.items.length) {
    content = (
      <div className="flex flex-col gap-1">
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
      <summary className="hover:bg-sidebar-accent flex list-none items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors">
        <SectionIcon className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{section.label}</span>
        {ActionIcon ? (
          <span className="text-muted-foreground shrink-0">
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
