import { type LangfuseItemType } from "@/src/components/ItemBadge";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { ExternalLink, X } from "lucide-react";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { usePeekViewNavigation } from "@/src/features/peek-view/hooks/usePeekViewNavigation";

interface TablePeekViewProps {
  itemType: LangfuseItemType;
  selectedId?: string;
  onClose: () => void;
  onExpand: (openInNewTab: boolean) => void;
  children: React.ReactNode;
}

export function TablePeekView({
  itemType,
  selectedId,
  onClose,
  onExpand,
  children,
}: TablePeekViewProps) {
  const { getNavigationPath, pageUrl } = usePeekViewNavigation(itemType);

  if (!selectedId) return null;

  return (
    <div className="sticky right-0 top-0 flex h-full w-[600px] flex-col border-l bg-background">
      <div className="flex h-12 items-center justify-between border-b bg-header p-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Details</span>
        </div>
        <div className="flex items-center gap-2">
          {selectedId && pageUrl && (
            <DetailPageNav
              currentId={selectedId}
              path={getNavigationPath}
              listKey="traces"
            />
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onExpand(true)}
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onClose()}
            title="Close details"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "flex-1 overflow-y-auto p-4",
          itemType === "TRACE" && "bg-background-subtle",
        )}
      >
        {children}
      </div>
    </div>
  );
}
